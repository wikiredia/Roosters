---
updated: 2026-10-29T23:10:00Z
---

**'Vandaag'** floating over the timetable when you've moved away from today: tap to go back (the timetable slides
there). Drag it anywhere; it settles in the nearest corner (taking the speed of your flick into account) with a
little bounce, and remembers that corner (`prefs` `today.corner`). Drag and tap are one gesture (Gesture Handler),
so moving it never counts as a tap.

## `TodayPill`, `Corner`, `cornerXY`

As above; the four corners and where each one is. Memo, and the drag and tap gestures are made once (again when the grid's
size changes), so keep `onPress` stable.

## `MARGIN`, `W`, `H`, `SNAP`

Distance from the edges, the pill's size, the bounce it settles with.
