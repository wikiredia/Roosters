---
updated: 2026-10-24T00:30:00Z
---

Step 4: **per semester, every course of your classes this school year**, all on; tap the ones you don't take
(they're excluded from your timetable and breaks). Not only the coming weeks: a course that starts in a month
or in S2 must be choosable now, since this choice lasts the whole year. The list comes from the API's course
scan (`sync.scan_courses`); while it runs you see the near weeks' courses with 'getting the rest of the school
year…' and the list fills in. From settings (`source=<id>`) for one class, with 'remove this class'. **Skip**
finishes onboarding.

## `ClassCourses`

The courses of one class in one semester (`GET …/courses?semester=`, which may say `syncing` or `scanning`
and poll) as chips.

## `CoursesStep`

Groups your class sources per semester (a whole-year source shows in both, with one set of choices) and saves
the excluded courses per source.

## `SemesterHead`

'SEMESTER 1 · sep – jan · Now'.
