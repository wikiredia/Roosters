---
updated: 2026-10-24T08:00:00Z
---

**Fetching timetables** and updating lessons, with **change detection**.

- **Untis classes** are fetched **once per class** (`class_lessons`), no matter how many students follow
  it, then filtered per student (include/exclude, hidden courses) when read (`schedule.lessons`).
- **Calendar links** are fetched per source (`source_lessons`).
- Both go through `apply`, which compares fingerprints and reports **what changed**. Changes for today
  and tomorrow become notifications for the people who follow that course.
- **Semesters**: a source can follow a class in one semester only (`sources.semester`); its changes only
  count on that semester's days (`terms.covers`). `refresh_classes` asks Untis for the class list once per
  semester, and `scan_courses` collects every course of the whole school year for onboarding.
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

## `_job_sync_class`, `_job_sync_source`, `_job_refresh_classes`, `_job_scan_courses`, `_job_fetch_class_week`

Job handlers (`sync_class`, `sync_source`, `refresh_classes`, `scan_courses`, `fetch_class_week`), retrying in 2, 5, 10, 10 and 2 minutes.

## `_notify`

Turns today's and tomorrow's changes into `schedule_change` notifications, with a dedupe key per change.

## `_side`

The fields of a lesson that go into a change notification.

## `apply`

Writes the lessons of one owner (a class or a source) and returns the changes: new, changed, cancelled.
- The **first** successful fetch reports nothing (otherwise your whole week would be 'new').
- Lessons that disappear are marked `removed` (shown as cancelled), unless the whole answer is
  empty while there were 5+ lessons (an outage).
- Every lesson carries its **kind** (`kinds.py`). It isn't part of the fingerprint: a kind worked out
  differently later is updated quietly, never a 'change' notification.
- Old lessons are deleted: class lessons after `KEEP_PAST_DAYS` (so you can scroll back through the
  school year), calendar-link lessons after a week.

## `queue_class`, `queue_source`, `queue_scan`, `queue_week`

Queue a sync (deduplicated per class or source); `soon=True` gives priority 1, for when someone is waiting.
`queue_scan` queues the course scan of a class at priority 2: right after the class's own sync, so the
near weeks show first and the rest of the year follows. `queue_week`: one week on demand, priority 1
(someone is looking at it), deduplicated per class and week.

## `queue_due`

Queues everything that's due (see above); `MOD(id, 15)` spreads them so not everything runs in the same minute.

## `refresh_classes`

Update a school's list of classes from Untis: classes that disappeared are turned off, new ones added, existing ones renamed.
Untis lists the classes of **one date**, so it asks once per semester (today for the current one, three
weeks into the other) and stores `in_s1` / `in_s2`. A semester Untis can't answer for (next year not
planned yet) marks every class as being in it; both failing is an error (retry).

## `_store_week`

One fetched week of a class into `class_lessons` (with its kind, no notifications) and `class_weeks`; used by
`fetch_class_week` and the course scan.

## `synced_weeks`

The first and last Monday the routine sync keeps fresh (this week + `WEEKS_AHEAD - 1`). Everything outside
is fetched on demand.

## `fetch_class_week`

One week of a class, fetched when someone looks at it (`schedule.ensure_weeks`): far ahead, or back
before they joined. Written to `class_lessons` like the routine sync but **without notifications**;
lessons of that week Untis no longer has become `removed` (unless the answer is suspiciously empty).
Records the week in `class_weeks` (with the error if Untis said no). `sync_class` records the weeks it
covers there too.

## `scan_courses`

The courses a class has this **school year**, per semester, into `class_courses`, so onboarding can offer a
course that only starts in a month or in S2. Untis gives one week per request, so it doesn't ask for every
week:
- a class is usually active in one semester (`in_s1`/`in_s2`): it starts in the current week, and when the
  class has nothing this week and next, it goes straight to the other semester;
- within a semester it follows `scan_walk`: week by week while new courses turn up, bigger steps after;
- weeks already stored (`class_weeks`: the routine sync, someone scrolling, an earlier scan) cost nothing;
  past weeks never change, so a rescan only fetches what's ahead;
- what it finds is written as it goes (the app shows it while the scan goes on: 'still looking for other
  courses in the background'); old rows are kept;
- fetched weeks are stored like `fetch_class_week` does, so scrolling there later is instant.
On a real AP class (1ITCSC1a, an S2 class): 8 courses with 12 requests instead of 45. Cancelled lessons don't
count. More than half the fetches failing stores `courses_error` and retries. `r_schools.courses` queues it
when the list is missing or older than `COURSES_RESCAN_DAYS`, `r_me.add_untis` when a class is first followed.

## `scan_walk`

The order the scan looks at the weeks of a semester: from the start week forward, then back, week by week
while weeks bring new courses; after two weeks without anything new the step grows to 2, then 4 weeks (a
course that's still missing probably comes back only now and then). At most `SCAN_SEMESTER_MAX` weeks.

## `sync_class`

Fetch one class from Untis, `apply`, then notify each follower about the changes in **their** courses
(and, for a source of one semester, only on that semester's days).

## `sync_source`

Fetch one calendar link (decrypted just for this), parse it (`ics.parse`), `apply`, notify.

## `tz_of`

A school's timezone, or the default.

## `wanted`

Does this user follow this course? (include = only these, exclude = not these, hidden = switched off in the app.)
With `picked` (courses chosen one by one in onboarding), `include` is the whole list, even when it's empty:
nothing chosen means nothing, not everything.
