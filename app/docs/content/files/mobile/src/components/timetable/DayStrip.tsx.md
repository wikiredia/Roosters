---
updated: 2026-10-24T11:00:00Z
---

The **week strip** above the timetable: seven equal cells. What you see in the grid is a white cell (the first day)
with a grey band stretching out of it; the dash on the band's edge sets how many days you see (1–7), **live**: the
grid's columns get thinner or wider with your finger (they share `count`) and settle with a bounce. It **mirrors the
grid**: swipe the timetable one day and the dates under the band move one day (the strip shows `offset - k` …);
when the swipe lands, `k` springs so the strip sits on the week again. When the band grows past Sunday the dates
slide left under it. Tap a day to start there. For screen readers the dash is an 'adjustable' control.

## `DayStrip`, `Props`

As above. `onResize` fires every time the dash covers another number of days, `onResizeEnd` when it's let go;
`nudge` makes the dash wiggle (first-time tip).

## `H`

The strip's height.
