---
updated: 2026-10-24T10:30:00Z
---

A **bottom sheet**: scrim, grabber, a title row with a close button. The one shadow in the app.

The scrim **fades** while the sheet **slides** (one Reanimated value, both ways; the native Modal itself
doesn't animate, its slide used to pop the dark scrim up as a rectangle). Drag the top of the sheet down to
close it (or flick it). The sheet stays mounted until it has slid away, so callers just set `visible` to
false; keep showing the last content meanwhile (see `LessonSheet`).

It starts sliding in the frame it appears (a layout effect), so a tap feels answered at once. No scroll bar: a
sheet is short, and long content is better split into pages (`BreakSheet`). A screen can pass its own `progress` and
`height` shared values to move things behind the sheet along with it, and `above`: something drawn over the scrim,
under the sheet, so it isn't dimmed (the chat lifts the message you long-pressed this way).

## `Props`, `Sheet`

As above.

## `OPEN`, `CLOSE`, `DISMISS_DISTANCE`, `DISMISS_VELOCITY`

Open in 230 ms (ease out), close in 180 ms (ease in); dragged 120 px down or flicked → closes.
