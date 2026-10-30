---
updated: 2026-10-30T12:00:00Z
---

Taptic engine / vibration motor bumps for the timetable's drag gestures, and the soft per-day snap they go with.
Only short impacts, never a vibration pattern. Does nothing on web. Used by
`mobile/src/components/timetable/DayStrip.tsx` (the strip's group, its handle, the week drag) and
`mobile/src/components/timetable/DayGrid.tsx` (pinch, swipe).

Both bump functions are plain JS: from a gesture worklet call them with `scheduleOnRN(tick)`. Fire `tick` only when a
rounded value changes (keep the last one in a shared value), never every frame.

## `tick`

Light impact: while dragging or pinching, the live value just passed a whole day (or a week in the strip's week drag).

## `snap`

Medium impact: let go, and the thing settles on a day.

## `magnet`

Worklet. Bends a live, fractional value (days) gently towards whole numbers while it's dragged: slower near a whole
day, a bit faster halfway, never backwards (`pull` < 1). Equal to `x` at whole and half numbers, so applying it on top
of the finger's position never makes things jump. Keep `pull` small (default 0.3): the user must still follow the
timetable while it moves.
