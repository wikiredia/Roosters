---
updated: 2026-10-29T23:10:00Z
---

**Measuring the Rooster tab** (guide 'Plan: a fast Rooster tab (and fast sheets)', Phase 0). For developers only:
everything is behind `debugEnabled` (development builds, or any build with `EXPO_PUBLIC_DEBUG=1`, which is how you measure
in release); the fps overlay starts off at every launch and a production build never shows it.

## `perfOverlay`

Whether the fps overlay (`components/PerfOverlay.tsx`) is on. The switch is on the Server & debug screen.

## `cacheStats`, `measuredSerialize`

How big the persisted query cache was at its last write (characters of the JSON) and how long `JSON.stringify` took.
`measuredSerialize` is the persister's `serialize` (`lib/query.ts`); in development it logs the first write once.

## `noteColumnRender`, `columnRenders`, `resetColumnRenders`

A counter of how often a day column of the grid rendered (`DayGrid.DayColumn` calls `noteColumnRender` while the overlay is on).
After a swipe it should be at most the columns that mounted; reset it on the debug screen before a test.

## `PerfProfile`

`<Profiler>` around `Calendar` and `DayGrid` in development builds: commits slower than 8 ms are logged as `[perf] …`
(`console.log`). Nothing in other builds (React's profiler is off in production).
