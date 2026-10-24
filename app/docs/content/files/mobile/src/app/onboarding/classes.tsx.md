---
updated: 2026-10-24T14:00:00Z
---

Step 3: your **classes per semester**. Two sections, **Semester 1** and **Semester 2** (with their months
and a 'Now' tag), each showing the classes you picked for it; below, one search over the school's classes
(the cached list, filtered offline). Every row has an **S1** and an **S2** chip (only for the semesters the
class exists in, from `in_s1`/`in_s2`); tapping the row picks the class for every semester it exists in, or
takes it out again. A class picked for both is two sources, so each semester has its own courses in the next
step. A class followed for the whole year (from before semesters) shows in both sections. Adding a class
fetches its timetable right away.

**Which semester**: Untis lists every class in both semesters, so a row tap first picks S1 and S2. For each
picked class `ClassProbe` asks for its courses (which starts the course scan); when they turn out to be in one
semester only, the row's picks drop the other one (only picks made with a row tap: a chip you tapped stays).
After that a row tap picks that semester only, and tapping the other chip still works but shows a short hint
under the row ('Vakken enkel gevonden in semester 2', 2.5 s).

**Search on a phone**: focusing the field scrolls it to the top of the screen with the results under it, above
the keyboard (with room added under a short list so it can get there); dragging the list closes the keyboard. **Skip** finishes onboarding. Also used from Timetable sources and Today
(`from=settings`).

## `ClassesStep`

Adds each new pick (`POST /me/sources/untis` with `class_id` and `semester`; a 409 from a retry counts as
saved). Picks are keys `classId:semester` in a `Set` together with the saved ones: while saving, a class is
saved and still picked at the same time, which used to render it twice (React's duplicate-key warning).

## `ClassProbe`

Renders nothing: one per picked class, polling `useCourses(school, class)`. It decides once the scan is done,
or earlier when courses were found only in the semester that isn't the current one (the scan starts in the
current semester and moves on only when the class has nothing there now). Then it calls `onFound(class, semester)`.

## `SemesterPicks`

One semester's section: heading, months, 'Now', and its chosen classes as chips (tap a new one to remove it).
