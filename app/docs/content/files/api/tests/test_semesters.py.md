---
updated: 2026-10-24T08:00:00Z
---

Semesters end to end: classes come with their semesters and the school year's dates; `refresh_classes` asks
Untis once per semester; the course list covers the **whole year** per semester (a course that only starts in
S2 is there), with `scanning` until the scan is done and a failing scan that retries and stops the app's polling;
the same class can be followed once per semester (409 for overlaps); and a class followed for S2 only isn't in
your S1 timetable. A class's own timetable shows every course; picked courses are exactly the ones you
follow (and an empty pick is nothing). The scan walk takes bigger steps once weeks stop adding courses, a class with
nothing now is scanned in the other semester, and weeks we already have aren't fetched again.

## `_semesters_around_today`, `_setup`

Sets the school's dates so today is in S1 (started 30 days ago, S2 in 30 days); signs a student in at the school.
