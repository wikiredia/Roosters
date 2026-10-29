---
updated: 2026-10-29T23:10:00Z
---

Two small hooks for **callbacks that must keep one identity but read current state**: what a memoised child
(`memo`) or a memoised gesture (`useMemo(() => Gesture…)`, handing the callback to `scheduleOnRN`) needs, because a new
function on every render makes the memo useless. Both update in an insertion effect, never during render.

## `useLatest`

A ref that always holds the newest value.

## `useStable`

A function that never changes and calls the newest `fn`. Used for the grid's tap, the strip's reset and `Sheet`'s close.
`Calendar` keeps one `latest` ref of its own for its many callbacks.
