---
updated: 2026-10-23T17:30:00Z
---

**Fetching timetables** and updating lessons, with **change detection**.

- **Untis classes** are fetched **once per class** (`class_lessons`), no matter how many students follow
  it, then filtered per student (include/exclude, hidden courses) when read (`schedule.lessons`).
- **Calendar links** are fetched per source (`source_lessons`).
- Both go through `apply`, which compares fingerprints and reports **what changed**. Changes for today
  and tomorrow become notifications for the people who follow that course.
- Scheduling: `queue_due` runs every scheduler round (`worker.schedule_round`) and only syncs classes
  **someone follows**: every 2 hours by day, every 8 at night, spread over 15 minutes.

When Untis is down: the error is stored on the class (shown in the app and console) and the job retries
in 2 minutes, up to 3 times; the next routine round tries again later. A suddenly empty answer while
there were lessons is treated as an outage and **removes nothing**.

## `FIELDS`, `fingerprint`

A lesson's fingerprint: SHA-1 of its fields. Different fingerprint = the lesson changed.

## `NOTIFY_DAYS`

Changes for today and tomorrow (school timezone) are worth a notification; later ones only show in the timetable.

## `SyncError`

A fetch failed (Untis, the network, a bad calendar). The job handlers turn it into `jobs.Retry`.

## `_hidden`

Hidden courses of several users at once.

## `_job_sync_class`, `_job_sync_source`, `_job_refresh_classes`

Job handlers (`sync_class`, `sync_source`, `refresh_classes`), retrying in 2, 5 and 10 minutes.

## `_notify`

Turns today's and tomorrow's changes into `schedule_change` notifications, with a dedupe key per change.

## `_side`

The fields of a lesson that go into a change notification.

## `apply`

Writes the lessons of one owner (a class or a source) and returns the changes: new, changed, cancelled.
- The **first** successful fetch reports nothing (otherwise your whole week would be 'new').
- Lessons that disappear are marked `removed` (shown as cancelled), unless the whole answer is
  empty while there were 5+ lessons (an outage).
- Lessons older than a week are deleted.

## `queue_class`, `queue_source`

Queue a sync (deduplicated per class or source); `soon=True` gives priority 1, for when someone is waiting.

## `queue_due`

Queues everything that's due (see above); `MOD(id, 15)` spreads them so not everything runs in the same minute.

## `refresh_classes`

Update a school's list of classes from Untis: classes that disappeared are turned off, new ones added, existing ones renamed.

## `sync_class`

Fetch one class from Untis, `apply`, then notify each follower about the changes in **their** courses.

## `sync_source`

Fetch one calendar link (decrypted just for this), parse it (`ics.parse`), `apply`, notify.

## `tz_of`

A school's timezone, or the default.

## `wanted`

Does this user follow this course? (include = only these, exclude = not these, hidden = switched off in the app.)
