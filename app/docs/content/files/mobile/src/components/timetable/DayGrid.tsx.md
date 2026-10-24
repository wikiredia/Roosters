---
updated: 2026-10-24T05:00:04Z
---

The **days side by side** as one continuous strip of columns. Every column is placed and sized on the UI thread from
the shared `offset` and `count` (`left = (day - offset) × width/count`), so swiping, pinching and the strip's handle
move all columns in the same frame; only a window of days around the view exists (`from`…`to`).

Gestures (Gesture Handler, all on the grid):
- **pan**: follows the finger; on release `days.snap` decides where it lands and `onTarget` tells the screen right
  away (dates and data update before the spring ends), then it springs there (`SWIPE`: calm, no bouncing through days);
- **pinch**: more or fewer days, the day under your fingers stays put; settles on whole days;
- **double tap**: `onDoubleTap` (the screen zooms the hours);
- **tap**: finds the lesson (or shared break) under the finger. Taps go through the gesture system instead of a
  Pressable per lesson, so a swipe or a pinch never ends as a tap on the lesson it lets go of. Blocks are still
  buttons for screen readers.

Lines are subtle dots (react-native-svg): hours across, a line between days. Lessons that arrive while you look slide
in from the side you came from; a day still loading shows a skeleton; today has the 'now' line. Free moments between
lessons (`Timetable.freeGaps`) are light grey with a small coffee cup, drawn behind everything: a shared break or a
cancelled lesson goes over them. They aren't tappable (screen readers read 'Vrij, 10:00 tot 11:00').

## `DayGrid`, `Props`, `DayData`

Overlapping lessons get an `OverlapBand` over the shared stretch. A tap there (or within 10 minutes of it,
`Timetable.lessonsAt`) calls `onPressOverlap` with those lessons instead of opening one.

As above. `DayData`: a day's lessons, its shared breaks (labelled) and whether it's still loading.

## `ColumnProps`

One day's column (placed from the shared values; re-renders only with its data).

## `LABEL_H`, `SWIPE`, `RESIZE`

The date row above the columns; the spring of a swipe; the spring the number of days settles with.
