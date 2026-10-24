---
updated: 2026-10-24T11:00:00Z
---

The **previews of onboarding's course step**, built on a class's whole timetable (`useClassLessons`, every
course). Nothing here is saved: they change the choices on the screen behind (`lib/choices.ts`).

## `PreviewSheet`

'Bekijk gevonden rooster': the week your choices give, week by week (only the classes of that week's semester).
Tap a lesson → `DropView`; 'Ik mis een les' → `MissingView`. The views swap inside the sheet with a fade.

## `DropView`

'Ik volg dit vak niet' for a lesson, with what could go wrong spelled out (`choices.dropAnalysis`): the course in
several of your classes (off in one, or in none), the same class in both semesters (only this semester, or both),
groups (switching off switches every group off), exams (they go too), and a class you'd follow nothing from any
more (with 'remove this class').

## `MissingView`, `HourPicker`, `HOURS`

'Ik mis een les': pick a day of the week and from–to hours; it lists what your classes have then (chosen or not,
`choices.missing`) with 'Voeg toe'. Nothing there → maybe it's in another class: 'Klas toevoegen'.

## `ClassWeekSheet`

'Bekijk het rooster van <klas>': that class's whole week; tap a lesson to switch its course on or off, courses you
don't take are faded.

## `WeekNav`, `useWeekLessons`, `startWeek`, `semesterOf`

‹ week › with its semester; the lessons of several classes for a week; the week previews open on (this one, or the
coming one at the weekend); which semester a week is in.

## `toLesson`, `semLabel`, `T`, `View_`

Small helpers: a class lesson as a `Lesson` for `WeekView`, 'Semester 1' or 'Heel het jaar', the view inside the sheet.
