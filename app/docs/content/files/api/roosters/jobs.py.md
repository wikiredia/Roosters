---
updated: 2026-10-23T17:30:00Z
---

The **job queue**, in MySQL (table `jobs`), shared by any number of workers (`worker.py`). It holds
everything slow or retryable: login mails, timetable syncs and class lists, cleanup.

- **Claiming:** `SELECT ... FOR UPDATE SKIP LOCKED`, so two workers never take the same job. A crashed
  worker's job becomes free again when `locked_until` passes (5 minutes).
- **Dedupe:** with a `dedupe` key, at most one waiting job per key; enqueuing again only moves it
  earlier or raises its priority. The key is cleared when the job finishes.
- **Retries:** exponential backoff (15 s, 30 s, ... up to an hour), or a handler raises `Retry(after=...)`.
  After `max_attempts` the job is `failed` with its last error.
- **Privacy:** the payload is cleared when a job finishes (it can hold an e-mail address and a login code).

**Adding a job kind:** decorate a function with `@jobs.handler("kind")` in the module that owns the work,
make sure `worker.py` imports that module, and enqueue it with `jobs.enqueue("kind", {...})`.

## `HANDLERS`, `handler`

The registry: job kind → function(payload). Handlers live next to their work (`sync.py`, `mailer.py`, `worker.py`).

## `LOCK_FOR`

How long a claimed job stays locked to its worker before another worker may take it over.

## `Retry`

Raise from a handler to try again later without logging a crash (e.g. Untis didn't answer). `after` overrides the backoff.

## `WORKER_ID`

`hostname:pid`, stored in `locked_by` and shown in the console's worker health.

## `_finish`, `_later`

End a job as done or failed (clearing dedupe and payload), or put it back in the queue for later.

## `claim`

Takes the next due job and marks it running (attempts + 1).

## `cleanup`

Delete finished jobs older than 3 days (called by the hourly cleanup job).

## `enqueue`

Adds a job (in the caller's transaction with `c=`). Lower `priority` runs first: 0 = login mail, 1 = the user is waiting, 5 = routine, 9 = cleanup.

## `run`, `run_one`

Run a claimed job with its handler and record the outcome. `run_one` claims and runs one job, and returns False when the queue is empty (the worker then sleeps a second). Tests call `run_one` directly (`conftest.run_jobs`).
