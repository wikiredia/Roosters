---
updated: 2026-10-24T10:30:00Z
---

Step 3: your **classes per semester**. Two sections, **Semester 1** and **Semester 2** (with their months
and a 'Now' tag), each showing the classes you picked for it; below, one search over the school's classes
(the cached list, filtered offline). Every row has an **S1** and an **S2** chip (only for the semesters the
class exists in, from `in_s1`/`in_s2`); tapping the row picks the class for every semester it exists in, or
takes it out again. A class picked for both is two sources, so each semester has its own courses in the next
step. A class followed for the whole year (from before semesters) shows in both sections. Adding a class
fetches its timetable right away.

**Which semester**: Untis lists every class in both semesters, so a row tap first picks S1 and S2. For each
picked class `ClassProbe` asks for its courses (which starts the course scan); the row says 'Lessen zoeken…'
meanwhile, and 'Vakken enkel gevonden in semester 2' when that's the outcome. Then the row's picks drop the other
semester (only picks made with a row tap: a chip you tapped stays), and a notice says so with an undo ('Toch ook
semester 1'). After that a row tap picks that semester only; tapping the other chip still works but shows a
short hint under the row (2.5 s).

**Saved classes** can be switched here too: tapping a saved pick (chip in the list or in a semester section)
asks to stop following it in that semester (`DELETE /me/sources/{id}`; its course choices go with it).

**Search on a phone**: focusing the field scrolls it to the top of the screen with the results under it, above
the keyboard (with room added under a short list so it can get there); dragging the list closes the keyboard. **Skip** finishes onboarding. Also used from Timetable sources and Today
(`from=settings`).

## `ClassesStep`

Also `unfollow` (stop following a saved pick), `found` (a probe's outcome: adjust row picks, remember what was
dropped) and `undrop` (the undo).

Adds each new pick (`POST /me/sources/untis` with `class_id` and `semester`; a 409 from a retry counts as
saved). Picks are keys `classId:semester` in a `Set` together with the saved ones: while saving, a class is
saved and still picked at the same time, which used to render it twice (React's duplicate-key warning).

## `ClassProbe`

## `Scan`

What a class's course scan found: `checking`, `both`, `none`, or the one semester with courses.

Renders nothing: one per picked class, polling `useCourses(school, class)`, reporting a `Scan` with
`onFound(class, scan)`. It decides **only once the scan is done**: around a holiday the scan skips ahead to the
other semester (nothing this week and next), so an early 'only semester 2' would be wrong.

## `SemesterPicks`

One semester's section: heading, months, 'Now', and its chosen classes as chips (tap a new one to remove it).
