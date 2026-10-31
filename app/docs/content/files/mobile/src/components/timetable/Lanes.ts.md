---
updated: 2026-10-31T17:05:00Z
---

**Vergelijken's lanes**: in compare mode (`Calendar` with `compare`) every day of the calendar is split into a lane
per person: you first (your lessons and the shared breaks with the friends you picked, exactly as on the Rooster tab),
then each friend in the order you picked them, in their own colour. Made in `Calendar` from your day (`DayCache`) and
the friends' weeks (`api/hooks.useFriendWeeks`, one request per friend and week), memoised as a whole map; the grid
(`DayGrid`) draws them and finds which lane a tap or a drag is in from where across the day it is (0–1).

## `FRIEND_COLORS`, `friendColor`, `soft`

A colour per friend by their place in the comparison: never the blue of 'you' or the yellow of a shared break, and
different for each, so there's no legend on Vergelijken (the faces top right in `app/compare.tsx` have a ring in the
same colour). `soft` is the see-through fill of a class in that colour, which reads in light and dark mode.

## `Lane`, `FriendDay`, `EMPTY_W`

A lane: whose (`who` null = you), its colour, its part of the day's width (`x0`–`x1`), and for a friend their merged
classes and the ones you asked them to skip (pending, only you see them as asked). Each lane has a `name` ('Jij' or the friend's first name) for the names row in `DayGrid`. A lane with nothing that day
(loaded; or hidden) is `EMPTY_W` (0.55) as wide as one with something, with 'Leeg' (or 'Verborgen') in the middle.

## `withLanes`

Your `DayData` with `lanes`, plus: your taps and draggable classes limited to your lane; a `TAP_FRIEND` per friend's
class (its sheet) and a draggable target per class of theirs that's busy, not cancelled and not asked yet (`lane` =
their place: `Calendar` asks them to skip it); `bounds` over everyone's classes, so the hours stretch for theirs too;
`anything` (someone has something that day: the empty-day arrows) and `waiting` (someone's week is still loading).

## `laneAt`

The lane at a point across the day.
