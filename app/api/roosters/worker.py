"""Background work: a scheduler that queues jobs, and a runner that executes them.

Run as many workers as you like (one per server, or more): only one of them schedules at a time
(Redis lock), and every job is taken by exactly one worker (see jobs.py)."""
import datetime as dt
import logging
import signal
import time

import pymysql
import redis

from . import accounts, config, db, debug, idempotency, jobs, mailer, redisx, sync  # noqa: F401 (mailer, sync: register their jobs)
from .migrate import wait_for_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("roosters.worker")

TICK = 30           # seconds between scheduler rounds
CLASS_LISTS = 24    # hours between refreshing the list of classes of a school

_stop = False


def _on_signal(*_):
    global _stop
    _stop = True


def schedule_round():
    """Queues what is due. Safe to call from several workers: only the lock holder does it."""
    with redisx.lock("scheduler", ttl=TICK * 2) as mine:
        if not mine:
            return
        hour = dt.datetime.now(config.TZ).hour
        sync.queue_due(hour)
        for s in db.rows("SELECT id FROM schools WHERE active=1 AND untis_server IS NOT NULL AND "
                         "(classes_synced_at IS NULL OR classes_synced_at < UTC_TIMESTAMP() - INTERVAL %s HOUR)",
                         (CLASS_LISTS,)):
            jobs.enqueue("refresh_classes", {"school_id": s["id"]}, dedupe=f"refresh_classes:{s['id']}", max_attempts=3)
        jobs.enqueue("cleanup", dedupe="cleanup", run_at=db.utcnow() + dt.timedelta(hours=1), priority=9)


@jobs.handler("cleanup")
def _cleanup(_p: dict):
    jobs.cleanup()
    idempotency.cleanup()
    db.run("DELETE FROM login_codes WHERE created_at < UTC_TIMESTAMP() - INTERVAL 1 DAY")
    db.run("DELETE FROM sessions WHERE (revoked_at IS NOT NULL AND revoked_at < UTC_TIMESTAMP() - INTERVAL 30 DAY) "
           "OR expires_at < UTC_TIMESTAMP() - INTERVAL 30 DAY")
    db.run("DELETE FROM notifications WHERE created_at < UTC_TIMESTAMP() - INTERVAL 30 DAY")
    db.run("DELETE FROM checkins WHERE day < UTC_DATE() - INTERVAL 7 DAY")
    # Guests whose phone is gone: no session left (they expire after REFRESH_TTL_DAYS without use)
    for g in db.rows("SELECT id FROM users u WHERE is_guest=1 AND created_at < UTC_TIMESTAMP() - INTERVAL 7 DAY "
                     "AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.user_id=u.id AND s.revoked_at IS NULL "
                     "AND s.expires_at > UTC_TIMESTAMP())"):
        with db.tx() as c:
            accounts.delete_user(c, g["id"])


def main():
    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)
    wait_for_db(120)
    log.info("worker %s started (ENV=%s, MAIL_MODE=%s, SMTP %s:%s)", jobs.WORKER_ID, config.ENV, config.MAIL_MODE,
             config.SMTP_HOST, config.SMTP_PORT)
    last_tick = last_beat = 0.0
    while not _stop:
        try:
            if time.time() - last_beat >= 10:
                last_beat = time.time()
                debug.worker_heartbeat(jobs.WORKER_ID)
            if time.time() - last_tick >= TICK:
                last_tick = time.time()
                schedule_round()
            if not jobs.run_one():
                time.sleep(1)
        except (redis.RedisError, pymysql.err.OperationalError) as e:
            log.warning("database or Redis not reachable (%s), trying again in 5 s", e)
            time.sleep(5)
    log.info("worker stopped")


if __name__ == "__main__":
    main()
