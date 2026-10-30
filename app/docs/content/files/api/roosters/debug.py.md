---
updated: 2026-10-30T15:00:00Z
---

**Troubleshooting** the login-mail path: API → job in MySQL → worker → SMTP (Mailpit on the laptop).
It is the most common 'it doesn't work' on a fresh setup, so this explains in plain words what's wrong.

Used by `GET /api/v1/debug` (ENV=dev, or the owner's account: `r_debug.py`), by `python -m roosters.cli debug`, and
by the console's overview (`admin.overview`).

## `allowed`

May this user use the debug tools on a server that isn't ENV=dev? Only the account whose e-mail is
`config.DEBUG_EMAIL` (not a guest), also while switched to one of the test people it made (`test_owner_id`: then the
owner's row is checked, and a disabled owner counts as no). Used by `r_debug.dev_only` and `r_me.user_out` (`debug`).

## `HEARTBEAT_KEY`, `worker_heartbeat`

The worker writes `<worker id> <unix time>` to Redis every 10 seconds (expires after 2 minutes).

## `_hints`

Plain-language advice from the facts: no worker, MAIL_MODE not smtp, SMTP unreachable, the last mail's error, a mail stuck in the queue, or no code requested at all (then the app doesn't reach the API).

## `_smtp_check`

Can we open a TCP connection to the SMTP server? Returns its greeting, or the error.

## `_worker`

Is a worker alive (heartbeat younger than 60 seconds)?

## `diagnose`

All of the above plus the last 5 login-mail jobs, as one JSON answer.

## `send_test_mail`

Sends `mails.mail_check()` right away (not through the worker), so the SMTP error comes back to the caller.
