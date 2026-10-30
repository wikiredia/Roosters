---
updated: 2026-10-30T09:30:00Z
---

Step 6 of 9: **is this what your timetable says about a lesson?** Per origin (your school's classes, each calendar
link; `api/roosters/r_details.py`) the fields we found in its data (Type, Building, Floor, Classroom, Group, ...;
`api/roosters/details.py`), each with its value in one of your own lessons ('Another example' goes through a few).
Tap a field to rename it, merge it with the one before or after, split a merge again or hide it; **Back to what we
found** undoes it all. When schoolmates use another layout that fits, a banner offers it ('N students at your school
use this layout' → **Use it**), which you can then still change. **Looks right** saves every origin
(`PUT /me/details/<origin>`, also unchanged: then it stays put), then the week. **Skip** finishes onboarding like the
other steps. From settings (`from=settings`: Timetable sources → Class details) it's the same and saving goes back.

A location that doesn't fit the pieces ("Online") shows whole in the first location field, with a line that says so.
The lesson sheet (`components/timetable/LessonSheet.tsx`) shows lessons with what's saved here.

## `DetailsStep`

Keeps your changes per origin (`drafts`) until you save; an origin still being fetched (`syncing`) that you didn't
touch is not saved (nothing to confirm yet).

## `OriginCard`

One origin: name (when there are several), 'still fetching', schoolmates' layout, the example and the fields. The
values come from `lib/details.detailRows` on a copy of the layout with nothing hidden, so you see what you hide.

## `FieldSheet`

One field: its title (empty = our name; applied when you leave the field, so you can type spaces), 'Show on a
class', 'Merge with …' before and after (`lib/details.mergeNext`), 'Split up again' (`unmerge`).
