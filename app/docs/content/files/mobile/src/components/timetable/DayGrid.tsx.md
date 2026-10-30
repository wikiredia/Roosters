---
updated: 2026-10-30T00:15:00Z
---

The **days side by side** as one continuous strip of columns. Every column is placed and sized on the UI thread from
the shared `offset` and `count` (`left = (day - offset) × width/count`), so swiping, pinching and the strip's handle
move all columns in the same frame; only a window of days around the view exists (`from`…`to`).

Gestures (Gesture Handler, all on the grid):
- **pan**: follows the finger; on release `days.snap` decides where it lands and `onTarget` tells the screen right
  away (dates and data update before the spring ends), then it springs there (`SWIPE`: calm, no bouncing through days);
- **pinch**: more or fewer days; the day on the left stays on the left (zooming out adds days on the right, never back in
  time; zooming in narrows towards that day), whatever the fingers are over; settles on whole days;
- **double tap**: `onDoubleTap` (the screen zooms the hours);
- **tap**: finds the lesson (or shared break: `onPressTogether(day, span)`) under the finger. Taps go through the gesture system instead of a
  Pressable per lesson, so a swipe or a pinch never ends as a tap on the lesson it lets go of. Blocks are still
  buttons for screen readers. The gesture first asks the UI thread whether anything under the finger opens a sheet
  (`TapTargets`, filled from the days' `taps`): a tap on nothing never wakes JS. `tapAt` (JS) then decides which sheet.

The gestures are `useMemo`'d (Reanimated's advice), so they are made again only when the width, the hours or a callback
change; the callbacks from `Calendar` and `tapAt` (`useStable`) therefore have to keep their identity.

Lines are subtle dots (react-native-svg): hours across, a line between days. A day still loading shows a skeleton and
its lessons **fade in from the side you came from when they arrive while that day is in view**; a column that mounts with
its data, or gets it out of sight, shows them as they are. There are **no layout transitions on the blocks**: when the
hours change (zoom, a swipe to days with earlier lessons) they jump to the new place. A layout animation per block restarted
a 200 ms animation for every block on every frame of a pinch or of dragging the strip's handle. Today has the 'now' line. Free moments between
lessons (`Timetable.freeGaps`) are light grey with a small coffee cup, drawn behind everything: a shared break or a
cancelled lesson goes over them. They aren't tappable (screen readers read 'Vrij, 10:00 tot 11:00').

## `DayGrid`, `Props`, `GridView`

Overlapping lessons get an `OverlapBand` over the shared stretch. A tap there (or within 10 minutes of it,
`Timetable.lessonsAt`) calls `onPressOverlap` with those lessons instead of opening one.

As above. `data(day)` gives a day's `DayData` (`DayCache`: everything is worked out already). `GridView`: the store
`Calendar` keeps with the direction you went and where you are, read (never rendered with) by the columns.

With `drag` a class of yours can be picked up and dropped into the bin to skip it: the gesture is
`SkipDrag.useSkipGesture`, first in the gesture tree (the swipe and taps wait until it fails, which is at once
when the finger isn't on a draggable class). A tap on a skipped class opens it, unless a shared break is over it.

## `ColumnProps`

One day's column (`DayColumn`), placed from the shared values. It gets its props **explicitly** (not the grid's `{...p}`) and only
numbers, strings, shared values, `DayData` objects and callbacks that keep their identity, so a swipe does not render it:
`hours` is the same array while its two numbers are, `nowMin` is `null` on every day but today (today's column is the only
one that re-renders each minute), and the direction comes from the `view` store when its data arrives. `past` lessons and
today's shared breaks that are over are worked out here from `nowMin`, not in the cache. `noteColumnRender` counts each
render for the fps overlay.

## `LABEL_H`, `SWIPE`, `RESIZE`

The date row above the columns; the spring of a swipe; the spring the number of days settles with.

Memoised: give it stable callbacks (`Calendar` does), so opening a sheet doesn't re-render every column. A single tap
waits 200 ms for a possible double tap. A tap on a hatched (`muted`) shared break does nothing, and for today that includes
the ones that ended before `nowMin`.
