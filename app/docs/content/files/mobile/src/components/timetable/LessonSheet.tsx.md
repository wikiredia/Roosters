---
updated: 2026-10-30T02:00:00Z
---

Tap on a lesson: when, what, where, and who else is free if it's cancelled. `LessonSheet`, `OverlapSheet` (and `BreakSheet`) are
`memo`, and `Calendar` gives them callbacks that keep their identity, so opening one renders only that sheet.

From the Rooster grid they open in two stages (`peek`, `peeking`; see `ui/Sheet`): with `peek` the sheet is always there
(out of sight), also before it ever had content, so the UI thread can start showing it; `peeking` means it has its
content but only peeks (not `visible`). Before the first lesson it shows the empty chrome (title 'Les'): that's what a
peek shows if the content comes a frame late.

## `OverlapSheet`

'Welke les?': the lessons of a tapped overlap in time order (kind colour, time, kind, room). Picking one closes it
and the screen opens that lesson's `LessonSheet`.

## `Props`, `LessonSheet`

The content is `LessonBody` (`subOf`: the line under the title).

A bottom sheet. Keeps the last lesson while it slides away (`lesson` becomes null when it closes). With `onSkip`:
'Skip this class' for a class still to come (`lib/skips.canSkip`), with a hint that dragging is quicker; a skipped
one says so, lists who's free then (like a cancelled one) and has 'I'll go after all' (`onUnskip`).
