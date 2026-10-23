---
updated: 2026-10-23T17:30:00Z
---

The lists **onboarding** shows: schools, campuses, classes, and the courses of a class (to switch off
the ones you don't take). All answers use ETags: classes are a few hundred rows that the app caches and
filters offline while you type.

Schools come from the `schools` table, and only **active** ones are listed. An empty list means nobody
added a school yet: add one in the console (Roosters+ → Schools & classes) or with `cli.py add-school`.
Students can still skip the step and add a calendar link.

## `_school`

The school or 404 `school_unknown` (inactive schools count as unknown).

## `campuses`

`GET /api/v1/schools/{id}/campuses`.

## `classes`

`GET /api/v1/schools/{id}/classes?q=`: all active classes (up to 2000), optionally filtered.

## `courses`

`GET /api/v1/schools/{id}/classes/{class}/courses`: the courses this class has from this week on, with lesson counts. A class that was never fetched is queued now, and the answer says `syncing: true` (the app asks again a moment later).

## `schools`

`GET /api/v1/schools`: active schools, alphabetical.
