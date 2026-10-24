---
updated: 2026-10-24T03:30:00Z
---

The **week strip** above the timetable: Mon … Sun with their dates (weekend cells narrower). The first
day you see is a **white rectangle**; the other days you see are a **grey one stretching out of it**,
with a little dash on its right edge. Drag the dash over more or fewer days (1–5, never past Friday, or
Sunday at the weekend): it follows the finger with a rubber band past the ends, changes the number of
columns live each time it covers another day, and settles with a bounce. Tap a day to start there. The
rectangles slide with a spring when you swipe to another page. For screen readers the dash is an
'adjustable' control (swipe up/down for more/fewer days).

## `DayStrip`, `Props`

As above. `nudge`: the first-time 'pull me' wiggle of the dash.

## `cells`

The x and width of each day cell for the strip's width (the worklet uses these to know which day the dash
is over).

## `GAP`, `WEEKEND`, `BOUNCE`

Space between cells, how wide a weekend cell is (0.62 of a school day), the spring the dash settles with.
