---
updated: 2026-10-24T05:00:00Z
---

**Your course choices** per class source while you pick them, before they're saved (onboarding step 4, a class in
settings). Pure functions; the screen keeps a `Choices` object in state.

## `Choice`, `Choices`, `initialChoice`

`include` (exactly these, empty = none: new sources start here, so nothing is on until you choose it) or `exclude`
(everything but these: sources saved before picking existed). `initialChoice` turns what's saved into one.

## `isOn`, `setOn`, `setAll`, `countOn`

Is a course on, switch one, 'Alles kiezen' / 'Niets kiezen' (the courses listed now), how many are on.

## `toConfig`

What `PATCH /me/sources/{id}` gets: `include` + `picked: true`, or `exclude`.

## `inSemester`, `preview`

Does a source count in a semester; several classes' lessons as one timetable with only your courses, each lesson once.

## `dropAnalysis`, `DropOption`

What 'Ik volg dit vak niet' should ask (see `CoursePreview.DropView`).

## `missing`

'Ik mis een les': what your classes have on a day between two times, the ones you haven't chosen first.
