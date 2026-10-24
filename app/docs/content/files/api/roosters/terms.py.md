---
updated: 2026-10-24T00:30:00Z
---

**School years and semesters**, as pure functions. A school has `year_start`, `s2_start` and `year_end` as
`MM-DD` (migration `0003_semesters.sql`, editable in the console via `admin.edit_school`): **S1** runs from
`year_start` to the day before `s2_start`, **S2** from `s2_start` to `year_end`. The summer in between is no
semester. Used by `schedule.lessons` and `sync.sync_class` (a source of one semester only counts on its days),
`sync.refresh_classes` and `sync.scan_courses` (which dates to ask Untis for), and `r_schools.classes` (the
dates for the app). Tested in `tests/test_terms.py`.

## `DEFAULTS`

09-01, 02-01, 07-15: a Belgian college year (exams in January belong to S1, June exams to S2).

## `Year`, `Year.range`, `Year.semester`, `Year.out`

One school year: its start, the start of S2 and its end. `range(1|2)` gives a semester's first and last day,
`semester(day)` 1, 2 or None, `out(today)` the dates and the current semester as the app gets them.

## `school_year`, `_year`

The school year a day falls in; during the summer after `year_end` the **coming** one (onboarding in August
sets up next year). Cached: it runs for every lesson row `schedule.lessons` reads.

## `covers`

Does a class followed in this semester (None = all year) count on this day?

## `_md`, `_date`

Parse `MM-DD` (an invalid value falls back to the default, so a bad console edit can't break timetables),
and build a date from it (02-29 becomes 02-28 in other years).
