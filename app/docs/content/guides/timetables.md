---
title: Timetables: Untis, calendar links and sync
position: 30
updated: 2026-10-30T09:31:00Z
---

## Where lessons come from

| Source | Stored in | Fetched by |
| --- | --- | --- |
| A school class in **Untis** (public view) | `class_lessons`, **once per class** | `sync.sync_class` → `untis.fetch_class` |
| A personal **calendar link** (.ics) | `source_lessons`, per source | `sync.sync_source` → `netfetch.fetch` + `ics.parse` |

A user's `sources` say what they follow: a class (with include/exclude course filters) or a link (encrypted
URL, optional keywords). `hidden_courses` switches courses off across all sources. Reading combines all of
this per user: `schedule.lessons`.

## Semesters

A school year has two semesters, with dates per school (`schools.year_start`, `s2_start`, `year_end`, as
`MM-DD`; `terms.py`). Classes can differ per semester, so:

- `sync.refresh_classes` asks Untis for the class list once per semester and stores `in_s1` / `in_s2`.
- A source can follow a class in **one semester** (`sources.semester` 1 or 2) or the whole year (NULL).
  Its lessons and notifications only count on that semester's days (`terms.covers`). The same class in S1
  and S2 is two sources, each with its own course choices.
- The courses you pick from in onboarding are the **whole school year**, not the fetched weeks:
  `sync.scan_courses` samples the year into `class_courses`: it finds the class's semester first, then walks
  its weeks with growing steps and reuses weeks already stored (about 12 requests for a real AP class instead
  of 45), refreshed monthly when someone asks (`r_schools.courses`). The normal sync still fetches
  only `WEEKS_AHEAD` weeks.

## Kinds of lessons

Theory, lab, exercises, project, support, internship, info, exam or other: `kinds.classify` works it out when a
lesson is fetched, from Untis' free text, the subject and the period's flags, and only the kind is stored. The app
gives every kind its own colour.

## Lesson details: fields per student

What a source says about a lesson is shown as named fields: "Labo · NOO.-01.019" becomes **Type: Labo | Building:
NOO | Floor: -01 | Classroom: 019** (and Group when Untis has student groups). Nothing is fixed to one school or to
Untis: `details.detect` looks at the locations a source actually has and guesses how they break up (which separator,
which piece is the building, floor or room); each student checks that in onboarding step 6
(`mobile/src/app/onboarding/details.tsx`) and can rename a field, merge fields or hide one. That **layout** is saved
per student and **origin** (`untis:<school>`: all classes of a school write rooms the same way; `ics:<link>`: one
calendar link) in `detail_layouts`, and schoolmates' layouts are offered as a starting point (titles and structure
only). Lessons carry their `origin`; the app breaks the raw location up itself when a lesson is opened
(`mobile/src/lib/details.ts`, the twin of `details.apply`). Routes: `r_details.py`. A new kind of information is a key
in `details.FIELDS` plus a value on the lesson (see `details.py`).

## When things are fetched

- The scheduler round (`worker.schedule_round`, every 30 s, one worker at a time) calls `sync.queue_due`:
  followed classes and links not synced for 2 hours (8 at night), spread over 15 minutes.
- Adding a class or link, or 'Refresh' in the app, queues it **with high priority**.
- Class lists of schools are refreshed every 24 hours (`sync.refresh_classes`).
- The course list of a whole school year (`sync.scan_courses`): when a class is first followed, and when
  onboarding or settings asks for a list older than 7 days. Priority 2, right after the class's own sync.
- **Any other week**, back or ahead: fetched when someone looks at it (`schedule.ensure_weeks` →
  `sync.fetch_class_week`, recorded in `class_weeks`); the app shows a skeleton while `loading`. Class lessons
  are kept for `KEEP_PAST_DAYS`, so scrolling back works offline too.
- Every request to an Untis server is spaced 1 s apart across all workers (`redisx.throttle`).

## Change detection

`sync.apply` compares a fingerprint per lesson: new, changed, cancelled, and disappeared (shown as
cancelled). The first fetch reports nothing. An empty answer after a full timetable is treated as an outage
and removes nothing. Changes for today and tomorrow become notifications, only for people who follow
that course.

## When it goes wrong

- Untis down: the error is stored on the class (`school_classes.last_error`), the app keeps showing the last
  known timetable with a calm note, the console shows it under sync errors, and the job retries.
- A school without public class timetables: `untis.list_classes` says so; students use their personal
  iCal link from WebUntis instead.
- A calendar link to an internal address: refused by `netfetch` (SSRF protection).

Tests: `api/tests/test_sync.py`, `api/tests/test_safety.py`.
