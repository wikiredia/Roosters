"""Job queue in MySQL, shared by any number of workers.

A worker claims one job with SELECT ... FOR UPDATE SKIP LOCKED, so two workers never take the same
job, and a crashed worker's job becomes free again when `locked_until` passes."""
import datetime as dt
import logging
import os
import socket
import traceback
from typing import Callable

from . import db

log = logging.getLogger("roosters.jobs")

LOCK_FOR = dt.timedelta(minutes=5)
WORKER_ID = f"{socket.gethostname()}:{os.getpid()}"

HANDLERS: dict[str, Callable[[dict], None]] = {}


def handler(kind: str):
    def wrap(fn):
        HANDLERS[kind] = fn
        return fn
    return wrap


class Retry(Exception):
    """Raise from a handler to try again later without counting it as a crash."""

    def __init__(self, message: str, after: dt.timedelta | None = None):
        super().__init__(message)
        self.after = after


def enqueue(kind: str, payload: dict | None = None, *, dedupe: str | None = None, run_at: dt.datetime | None = None,
            priority: int = 5, max_attempts: int = 5, c=None) -> int | None:
    """Adds a job. With `dedupe`, a job with the same key that is still waiting is kept as it is
    (only moved earlier if this one should run sooner). Lower priority runs first."""
    run_at = run_at or db.utcnow()
    return db.run(
        "INSERT INTO jobs (kind, dedupe, payload, run_at, priority, max_attempts) VALUES (%s,%s,%s,%s,%s,%s) "
        "ON DUPLICATE KEY UPDATE run_at=LEAST(run_at, VALUES(run_at)), priority=LEAST(priority, VALUES(priority))",
        (kind, dedupe, db.js(payload or {}), run_at, priority, max_attempts), c)


def claim() -> dict | None:
    now = db.utcnow()
    with db.tx() as c:
        job = db.one(
            "SELECT * FROM jobs WHERE status IN ('queued','running') AND run_at <= %s "
            "AND (locked_until IS NULL OR locked_until < %s) "
            "ORDER BY priority, run_at LIMIT 1 FOR UPDATE SKIP LOCKED", (now, now), c)
        if job is None:
            return None
        db.run("UPDATE jobs SET status='running', locked_by=%s, locked_until=%s, attempts=attempts+1 WHERE id=%s",
               (WORKER_ID, now + LOCK_FOR, job["id"]), c)
    job["attempts"] += 1
    job["payload"] = db.unjs(job["payload"], {})
    return job


def _finish(job_id: int, status: str, error: str | None = None):
    # dedupe=NULL: the same key can be queued again; payload cleared (may contain e-mail addresses)
    db.run("UPDATE jobs SET status=%s, dedupe=NULL, payload=NULL, locked_by=NULL, locked_until=NULL, "
           "finished_at=UTC_TIMESTAMP(), last_error=%s WHERE id=%s", (status, error, job_id))


def _later(job: dict, error: str, after: dt.timedelta | None):
    if after is None:
        after = dt.timedelta(seconds=min(3600, 15 * 2 ** (job["attempts"] - 1)))
    db.run("UPDATE jobs SET status='queued', locked_by=NULL, locked_until=NULL, run_at=%s, last_error=%s WHERE id=%s",
           (db.utcnow() + after, error[:1000], job["id"]))


def run(job: dict):
    fn = HANDLERS.get(job["kind"])
    if fn is None:
        _finish(job["id"], "failed", f"unknown job kind {job['kind']}")
        return
    try:
        fn(job["payload"])
    except Retry as e:
        if job["attempts"] >= job["max_attempts"]:
            _finish(job["id"], "failed", str(e)[:1000])
        else:
            _later(job, str(e), e.after)
        return
    except Exception as e:
        log.error("job %s (%s) failed:\n%s", job["id"], job["kind"], traceback.format_exc())
        if job["attempts"] >= job["max_attempts"]:
            _finish(job["id"], "failed", f"{e.__class__.__name__}: {e}"[:1000])
        else:
            _later(job, f"{e.__class__.__name__}: {e}", None)
        return
    _finish(job["id"], "done")


def run_one() -> bool:
    """Claims and runs one job. False when there was nothing to do."""
    job = claim()
    if job is None:
        return False
    run(job)
    return True


def cleanup(keep_days: int = 3):
    db.run("DELETE FROM jobs WHERE finished_at IS NOT NULL AND finished_at < UTC_TIMESTAMP() - INTERVAL %s DAY",
           (keep_days,))
