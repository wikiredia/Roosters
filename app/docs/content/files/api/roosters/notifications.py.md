---
updated: 2026-10-24T13:10:00Z
---

**In-app notifications**, and the push that goes with them. Stored as `kind` + `payload`; the **app** writes the
sentence in the user's language, `push.py` the text of the push. Kinds: `schedule_change` (from `sync._notify`) and
`break_request`, `break_counter`, `break_answer`, `break_cancelled` (`breaks.py`). Each has a `dedupe` key, so the
same thing is never reported twice; `push=0` keeps one out of push (a cancelled break you hadn't said yes to).

## `enqueue`

Adds a notification unless one with the same dedupe key exists (returns False then). A new one with `push` queues
`push` for that user, inside the caller's transaction. Deliberately without a dedupe key: a job that is sending right
now still holds its key, so a new notification would be swallowed. The first job takes everything not pushed yet
(several notifications from one sync become one round of pushes, see `push._job_push`); the jobs after it find nothing.

## `list_for`

Newest first, optionally only those after an id (polling).

## `mark_read`

Marks everything up to an id as read.

## `out`

A notification for the app.
