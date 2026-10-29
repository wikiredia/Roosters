---
updated: 2026-10-29T23:10:00Z
---

The **summary after a skip**: a small dark card at the bottom of the calendar (`Calendar` shows it), so it never
covers more than the last hours of the grid. "Skipped DevOps", a countdown that is only the number (5, 4, 3, 2, 1)
with Undo, and below it what the skip changes (`lib/skips.skipChanges`; the friends line fills in once the server
answers). It goes by itself; a tap sends it away sooner. Also says when a skip was taken back or didn't go through.

## `SkipToast`, `SkipNote`

Memo: it renders when the note changes or the countdown ticks, not with the calendar (keep `onUndo` and `onDone` stable).
`note.id` changes per toast, so a new skip restarts the countdown. Undo goes to `Calendar`, which takes the last
skip back (`useSkip` with `skipped: false`).

## `UNDO_SECONDS`, `LINGER`

How long Undo is there (5 s) and how long the summary stays after it.
