---
updated: 2026-10-24T03:30:00Z
---

**Rooster** (timetable): 1–5 days side by side, swiped through as far back or ahead as you like, with
shared breaks in yellow. No day/week switch: the number of days is set by dragging the handle on the
week strip (`DayStrip`) or with the − / + buttons under it (remembered in `prefs` as `rooster.days`).
Swiping is `DayPager` (a short swipe shows the weekend after Friday, a long swipe or flick lands on the
next school days). The grid **fits the screen** (hours stretch to fill it, so the legend stays visible;
it only scrolls up and down when the day doesn't fit at `MIN_PX_PER_HOUR`). The first time, a small
hint under the strip explains the handle (`hint.days`); it goes away with 'Oké' or the first resize.
'Vandaag' appears when you've moved away (at the weekend the tab opens on the coming school week). Days
far back or ahead show a skeleton while the API fetches them from Untis (`loading`). Tapping a lesson
opens `LessonSheet`.

## `RoosterScreen`

The tab: strip, − / +, the hint, the fixed time axis with the pager, the legend (only what's on screen,
theory and lab always) and the lesson sheet.

## `PageView`

One page: its days from the cached Today answers (`useTodays`, the same requests the Today tab makes),
friends' shared breaks merged per slot, a skeleton while loading, 'no classes' when empty.

## `HOURS`, `MIN_PX_PER_HOUR`, `LABELS`

08–18 always on screen (stretched by earlier or later lessons on the page), the smallest hour height
before the grid scrolls, the height of the day labels above the columns.
