---
updated: 2026-10-31T20:11:00Z
---

The lists **onboarding** shows: schools, campuses, classes (per semester), and the courses of a class this
school year (to switch off the ones you don't take). All answers use ETags: classes are a few hundred rows that the app caches and
filters offline while you type.

Schools come from the `schools` table, and only **active** ones are listed. An empty list means nobody
added a school yet: add one in the console (Roosters+ → Schools & classes) or with `cli.py add-school`.
Students can still skip the step and add a calendar link.

## `_school`

The school or 404 `school_unknown` (inactive schools count as unknown).

## `campuses`

`GET /api/v1/schools/{id}/campuses`.

## `classes`

`GET /api/v1/schools/{id}/classes?q=`: all active classes (up to 2000), optionally filtered, each with
`semesters` ([1, 2], [1] or [2]: where Untis lists it), plus `terms`: the dates of both semesters of this
school year and the current one (`terms.Year.out`).

## `courses`

`GET /api/v1/schools/{id}/classes/{class}/courses?semester=`: the courses this class has **this school
year** (or in one semester), each with its lesson count and `semesters`. Not only the fetched weeks: a
course that starts in a month has to be choosable in onboarding, because the choice lasts all year.

- The year comes from `class_courses` (`sync.scan_courses`), queued here when it's missing or older than
  `COURSES_RESCAN_DAYS`. Until it's there: the courses of the weeks we have, and `scanning: true` (the app
  polls). After a failed scan `scanning` is false and `error` says why; the job retries by itself.
- Courses that appeared in the fetched weeks since the scan are added. A lesson without a name isn't a course to pick: it isn't listed.
- A class never fetched at all (and never scanned): it's queued and the answer says `syncing: true`.

## `class_lessons`

`GET /api/v1/schools/{id}/classes/{class}/lessons?start=&days=`: a class's whole timetable (every course,
with its kind and group) for up to 14 days. Onboarding shows it ('see this class's timetable'), previews the timetable
your picks would give, and searches it for 'Ik mis een les'. Public school data, like the class list; far
weeks are fetched on demand (`loading`), a class never fetched is queued.

## `schools`

`GET /api/v1/schools`: active schools, alphabetical.
