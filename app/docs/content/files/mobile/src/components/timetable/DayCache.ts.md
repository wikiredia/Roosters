---
updated: 2026-10-31T16:25:00Z
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
`only`, today, the language and today's plan (`DayPlan` or null) → a `Map` from day index to `DayData`. The plan is not
part of the week's cache key: it only replaces today's day (`withPlan`), so a check-in rebuilds one day, not the week. The Map has the same identity until some day is a
new object, so `Calendar`'s callbacks and `DayGrid` don't change for nothing. A week that hasn't come in gives `WAITING`
days (one shared object: loading, nothing on it).

## `DayData`

Fields: `lessons` (as the API gave them), `merged`, `together` (shared breaks, overlapping ones as one; `muted` is the
static part: over or too far ahead), `raw` (per friend, for "Pauze samen?" and what a skip changes), `loading`,
`blocks` (merged lessons and shared breaks; `past` is false), `overlaps`, `free`, `kinds`, `legend`, `bounds` (earliest
start and latest end, or null), `skippable` (merged classes that could be skipped if still to come) and `taps`
(`TapTargets`; your own break with nobody is `free` minus every shared break, hatched ones too, and only from today on:
a past day has none, like its muted shared breaks). `id` is a counter: `useDays` uses it to see that nothing changed.

## `nextDayId`

A new `DayData.id`, for days made from a cached one (`Lanes.withLanes`). `DayData` also has `lanes`, `anything` and
`waiting` in Vergelijken only, and `skippable` entries may carry a lane (`x0`, `x1`, `lane`).

## `DayPlan`, `HOURS`, `withPlan`

**Today's plan shapes your own breaks today** (Today's check-in, `Checkin`; `Calendar` turns it into a `DayPlan` and
keeps the object while its values are the same):
- `busy` (break_status 'busy', "Ik ben bezig"): the breaks between classes today aren't free: not drawn as your break,
  not tappable.
- `chill` (status 'chilling' / 'want_chill', "Ik blijf nog" / "Ik wil chillen"): after school is a break too: a free zone
  from the end of the last lesson you still go to (skipped and cancelled ones don't count, so skipping your last class
  moves the start back to the one before; no lessons: `since`, when you said it) to the end of the grid's day
  (`HOURS[1]`, or later when a lesson ends later, as `Calendar.hoursFor` stretches it); at least `FREE_MIN` long. It is
  tappable like any own break ("Meestal ga je met:"); shared breaks there come from the server (it counts after school as
  free for people who stay).

`withPlan` makes today's `DayData` again with that `free` and its `TAP_ALONE` taps (free minus the shared breaks), a new
`id`; `planned` (a `WeakMap` on the cached day) keeps it per plan object, so renders don't rebuild it. Only for today:
check-ins are per day. `HOURS` (the hours always on screen) lives here so both this and `Calendar` use it.

## `ASK_DAYS`

Asking for a break works for today and the 13 days after it (`api breaks.MAX_DAYS_AHEAD`); further ahead a shared break
is `muted`.

## `WAITING`, `slotsOf`, `without`, `buildDay`, `daysOf`, `same`

The placeholder day; the shared breaks as yellow blocks (overlapping ones merged, everyone in it named, state from
`lib/breaks.slotState`); spans minus what other spans cover (the free gaps where no shared break is drawn); one day with
all its derived fields; a week's seven days from the cache (a `WeakMap` on the
week's data, a few contexts per week, gone with the week); whether two contexts are the same.
