---
updated: 2026-10-24T05:00:04Z
---

The **week strip** above the timetable: seven equal cells. What you see in the grid is a white cell (the first day)
with a grey band stretching out of it; the dash on the band's edge sets how many days you see (1–7), **live**: the
grid's columns get thinner or wider with your finger (they share `count`) and settle with a bounce. Drag the dash
**left past the white cell** and the view becomes one day that follows your finger back in time: the white cell slides
left (at the strip's edge the dates slide right under it), the grid shows the days before; on release it settles on a
whole day and `onResizeEnd` gets that day as the new start.

The strip and the grid **move as one**: swipe the timetable one day and the dates under the band move one day (the
strip shows `offset - k` …); **swipe the strip** and the dates move with your finger while the grid follows (same
`days.snap`, same `onTarget` as the grid's swipe). When a swipe lands, `k` springs so the strip sits on the week again.
When the band grows past Sunday the dates slide left under it. The dash's drag blocks the strip's own swipe and tap.

Taps go through the gesture system (not a Pressable per day), so a swipe never ends as a tap: tap a day to start
there. Under each date a small **dot per kind** of lesson that day (`Timetable.kindsOf`, `KIND_DOT`: theory blue, lab
green, …; cancelled lessons don't count); today is the blue number. For screen readers every day is a button and the
dash an 'adjustable' control.

## `DayStrip`, `Props`

As above. `onResize` fires every time the dash covers another number of days, `onResizeEnd` when it's let go (with
the new first day when you pulled it back, else `undefined`); `kinds(day)` gives the dots, `busyWeekends` and
`onTarget` are the grid's, for the strip's own swipe;
`nudge` makes the dash wiggle (first-time tip). `n` is the number of days as React knows it, for the
screen reader label and the adjustable action: render never reads the shared `count` (Reanimated warns about that).

## `H`

The strip's height.
