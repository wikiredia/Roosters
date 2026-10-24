---
updated: 2026-10-24T00:30:00Z
---

Third migration: **semesters**. Students pick their classes per semester (S1 and S2 can differ), and pick
their courses from the **whole school year**, not just the weeks that were already fetched.

## `schools (alter at line 3)`, `schools (alter at line 4)`, `schools (alter at line 5)`

`year_start`, `s2_start`, `year_end` as `MM-DD` (defaults 09-01, 02-01, 07-15); see `terms.py`.

## `school_classes (alter at line 8)`, `school_classes (alter at line 9)`

`in_s1` / `in_s2`: which semester Untis lists the class in (`sync.refresh_classes`). Default 1: every class
was in both until the next class refresh.

## `school_classes (alter at line 11)`, `school_classes (alter at line 12)`

`courses_scanned_at` / `courses_error`: when `class_courses` was last made, and why the last try failed.

## `class_courses`

Every course of a class this school year, per semester, with its number of lessons and first/last day. Made by
`sync.scan_courses` (deleted and written again in one transaction), read by `r_schools.courses`. Shared by
everyone in the class, like `class_lessons`.

## `sources (alter at line 27)`

`semester`: 1 or 2 to follow a class in that semester only; NULL = the whole school year (every source made
before this migration).
