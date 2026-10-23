---
updated: 2026-10-23T17:30:00Z
---

The **worker process** (`python -m roosters.worker`, compose service `worker`). Run as many as you like.

Its loop: every 10 s a heartbeat (so the API and the console can see a worker is alive); every 30 s a
**scheduler round**, done by only one worker at a time (Redis lock); otherwise **run jobs** back to back,
sleeping 1 s when there's nothing to do. Database or Redis outages are waited out (retry every 5 s).

The imports matter: importing `mailer` and `sync` registers their job handlers.

## `TICK`, `CLASS_LISTS`

Seconds between scheduler rounds; hours between refreshes of a school's class list.

## `_cleanup`

The hourly `cleanup` job: old finished jobs, idempotency keys, login codes (> 1 day), sessions revoked or
expired more than 30 days ago, notifications (> 30 days), check-ins (> 7 days), and **abandoned
guests**: guest accounts older than 7 days with no valid session left (the phone was reset or
the app removed). They're deleted with `accounts.delete_user`.

## `_on_signal`

SIGTERM/SIGINT: finish the current job, then stop (`docker compose stop` waits for it).

## `main`

Startup (waits up to 2 minutes for the database) and the loop described above.

## `schedule_round`

Queues what is due: timetable syncs (`sync.queue_due`), class lists older than `CLASS_LISTS`, and the hourly `cleanup` job. Only the worker holding the `scheduler` lock does this.
