---
updated: 2026-10-24T02:00:00Z
---

A **bottom sheet**: scrim, grabber, a title row with a close button. The one shadow in the app.

The scrim **fades** while the sheet **slides** (one Reanimated value, both ways; the native Modal itself
doesn't animate, its slide used to pop the dark scrim up as a rectangle). Drag the top of the sheet down to
close it (or flick it). The sheet stays mounted until it has slid away, so callers just set `visible` to
false; keep showing the last content meanwhile (see `LessonSheet`).

## `Props`, `Sheet`

As above.

## `OPEN`, `CLOSE`, `DISMISS_DISTANCE`, `DISMISS_VELOCITY`

Open in 280 ms (ease out), close in 200 ms (ease in); dragged 120 px down or flicked → closes.
