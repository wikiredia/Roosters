---
updated: 2026-10-31T16:25:00Z
---

**What a tap on the grid can open, known on the UI thread.** Per day, `DayCache` lists the stretches of the day where a
tap opens a sheet (a lesson, lessons that overlap, a shared break you can ask for, a class you skip, your own break with
nobody). `DayGrid` copies
those of the window into a shared value (`useTapTargets`, as `SkipDrag.useDragTargets` does for the drag), so the tap
gesture can tell, in its `onEnd` worklet and without asking JS, whether the finger is on something (`tapKindAt`). Today a
tap on nothing never wakes JS; Phase 2 of the guide 'Plan: a fast Rooster tab' builds the instant peek on it.

`DayGrid.tapAt` (JS) still decides which sheet it is and has the last word; the targets only have to agree with it. The
order they are listed in is the order `tapAt` resolves a tap: overlap (and `OVERLAP_SLOP` minutes around it), lesson, shared
break that isn't muted, skipped class, your own break with nobody (a free gap minus the shared breaks, from today on;
today's that are over are dropped by `DayGrid`). Keep the two in step when you change one.

## `TapTarget`, `TAP_LESSON`, `TAP_OVERLAP`, `TAP_TOGETHER`, `TAP_SKIPPED`, `TAP_ALONE`, `TAP_FRIEND`

In Vergelijken a target has `x0`–`x1`: the part of the day's width (its lane) it is in; `TAP_FRIEND` is a friend's class.
`tapKindAt` gets where across the day the finger is (0–1).

A stretch (day, start and end in minutes) and what it opens. The kinds are numbers: they are read in a worklet.

## `tapKindAt`

The first stretch on that day that contains the minute → its kind, or -1. A worklet.

## `useTapTargets`

Keeps the list in a shared value, updated when it changes.
