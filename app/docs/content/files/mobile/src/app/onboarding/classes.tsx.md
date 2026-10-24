---
updated: 2026-10-24T00:30:00Z
---

Step 3: your **classes per semester**. Two sections, **Semester 1** and **Semester 2** (with their months
and a 'Now' tag), each showing the classes you picked for it; below, one search over the school's classes
(the cached list, filtered offline). Every row has an **S1** and an **S2** chip (only for the semesters the
class exists in, from `in_s1`/`in_s2`); tapping the row picks the class for every semester it exists in, or
takes it out again. A class picked for both is two sources, so each semester has its own courses in the next
step. A class followed for the whole year (from before semesters) shows in both sections. Adding a class
fetches its timetable right away. **Skip** finishes onboarding. Also used from Timetable sources and Today
(`from=settings`).

## `ClassesStep`

Adds each new pick (`POST /me/sources/untis` with `class_id` and `semester`; a 409 from a retry counts as
saved). Picks are keys `classId:semester` in a `Set` together with the saved ones: while saving, a class is
saved and still picked at the same time, which used to render it twice (React's duplicate-key warning).

## `SemesterPicks`

One semester's section: heading, months, 'Now', and its chosen classes as chips (tap a new one to remove it).
