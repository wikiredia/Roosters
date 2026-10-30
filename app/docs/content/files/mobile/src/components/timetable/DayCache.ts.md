---
updated: 2026-10-29T23:10:00Z
---

**Every day of the calendar with everything derived from it, made once.** A week comes in from `useWeeks`; its seven
days are built here (merged double periods, the blocks a column draws, overlaps, free gaps, the dots under the date,
the legend items, the hours the lessons span, which classes could be skipped, and what a tap can open) and kept. After
that nothing in a render or a gesture calls `mergeLessons`, `overlapsOf` or `freeGaps` again: `Calendar`, `DayGrid`,
`DayStrip` and the legend only read these fields.

The cache is **per week and keyed by the week's data object**. TanStack keeps the same object while the data is the same
(structural sharing, also across a 304), so a refetch that changed nothing changes nothing here, and moving `start`
re-uses every week still in the window. The key also holds what the days are made with: the friends' names, `useBreaks`
data, `only`, today and the language; change one and the week is built again. `dataUpdatedAt` is deliberately not part
of it. A `DayData` is never changed afterwards: a new object means the day changed, which is what lets `DayColumn` skip
its render when nothing did.

Watch out: nothing in a `DayData` may depend on the time of day. `past` on lessons and the 'over' look of today's
shared breaks are applied by whoever knows the time (`DayGrid.DayColumn`, `DayGrid`'s tap), from `nowMin`, which only
today's column gets.

## `useDays`

The hook: the weeks' data (undefined while a week hasn't come in), the Monday of the first one, the names, the breaks,
`only`, today and the language → a `Map` from day index to `DayData`. The Map has the same identity until some day is a
new object, so `Calendar`'s callbacks and `DayGrid` don't change for nothing. A week that hasn't come in gives `WAITING`
days (one shared object: loading, nothing on it).

## `DayData`

Fields: `lessons` (as the API gave them), `merged`, `together` (shared breaks, overlapping ones as one; `muted` is the
static part: over or too far ahead), `raw` (per friend, for "Pauze samen?" and what a skip changes), `loading`,
`blocks` (merged lessons and shared breaks; `past` is false), `overlaps`, `free`, `kinds`, `legend`, `bounds` (earliest
start and latest end, or null), `skippable` (merged classes that could be skipped if still to come) and `taps`
(`TapTargets`). `id` is a counter: `useDays` uses it to see that nothing changed.

## `ASK_DAYS`

Asking for a break works for today and the 13 days after it (`api breaks.MAX_DAYS_AHEAD`); further ahead a shared break
is `muted`.

## `WAITING`, `slotsOf`, `buildDay`, `daysOf`, `same`

The placeholder day; the shared breaks as yellow blocks (overlapping ones merged, everyone in it named, state from
`lib/breaks.slotState`); one day with all its derived fields; a week's seven days from the cache (a `WeakMap` on the
week's data, a few contexts per week, gone with the week); whether two contexts are the same.
