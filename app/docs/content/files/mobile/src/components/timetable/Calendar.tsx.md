---
updated: 2026-10-30T02:00:00Z
---

**The calendar**, shared by the Rooster tab (`app/(tabs)/rooster.tsx`) and Vergelijken (`app/compare.tsx`): your
days side by side (1–7), one continuous strip you scroll through day by day, as far back or ahead as you like. The
week strip on top (`DayStrip`), the grid's columns (`DayGrid`) and their widths share the same animated values
(`offset`: the left edge in days, `count`: how many days, `k`: where that first day sits in the strip), so
everything moves together in the same frame, on the UI thread.

- **Swiping** the grid or picking up the white day on the strip: day by day with a little momentum
  (`lib/days.snap`); an empty weekend is calm. Where a swipe lands is known as the finger lets go: dates and data
  switch then. Only the columns wait for data.
- **How many days**: drag the dash on the strip, pinch the grid, or − / + (until you've used the dash:
  `days.learned`). With `remember` (Rooster) it's remembered (`rooster.days`), 7 when this week's weekend is
  busy; Vergelijken always starts on 5 days and no tips.
- **Zoom**: double tap on the grid stretches the hours to your lessons; double tap again or the magnifier undoes it.
- **Reset**: double tap on the day strip above the grid = the Rooster tab's 'Reset' (standard view: this week, Monday to Friday, not zoomed).
- **Vandaag** (`TodayPill`) when you've moved away from today and from where it opened (`initialStart`).
- **Shared breaks** are yellow blocks with who they're with (`Timetable.TogetherBlock`). With `only` just the
  friends you picked (Vergelijken). One that's over, or further ahead than you can ask (more than 13 days:
  `api breaks.MAX_DAYS_AHEAD`), is **hatched** (`muted`) and a tap does nothing: you can't ask for it, so the app
  doesn't let you try. Tapping a yellow one opens `BreakSheet`.
- Each shared break shows what you did with it (asked, planned, declined: `lib/breaks.slotState` over `useBreaks`).
- **An empty weekend** at the right end of the view (nothing on Saturday and/or Sunday): an arrow in that empty space
  with the day it goes to ("MA 27"). It moves the view so that day is on the left, same number of days: Sunday when
  Sunday has something (and isn't on screen yet), otherwise Monday.
- Tapping a lesson opens `LessonSheet`; where lessons overlap, `OverlapSheet` first. A tap is answered **at once with a
  peek** (see below), and a double tap still zooms everywhere.

**Fast, because little renders** (guide 'Plan: a fast Rooster tab', Phase 1):
- `Calendar` is `memo`, so the Rooster screen changing its header (`onView`) doesn't render it a second time.
- **The days come from `DayCache.useDays`**: built once per week that comes in and kept while that week's data, the names,
  the breaks, `only`, today and the language stay the same. Moving `start` re-uses the weeks still in the window, and a
  refetch that changes nothing (a 304) changes nothing: `dataUpdatedAt` is not a dependency. `hours`, `legend` and `kinds`
  are read from the days' precomputed fields; nothing here calls `mergeLessons` in a render.
- **Everything below is `memo` with props that keep their identity**: `DayStrip` (it gets the `kinds` Map), `TimeAxis`,
  `DayGrid`, `DragLayer`, `TodayPill`, `SkipToast`, `Legend` and the three sheets. The callbacks are `useCallback`s that
  read the newest state through the `latest` ref (updated in an insertion effect), and `hours` keeps its identity while
  the two numbers are the same (it is memoised on `"h0:h1"`). Opening a sheet therefore renders this component and that
  sheet; a swipe renders the columns that mount (the render counter in the fps overlay shows it).
- **Which way you went** (`heading`) and where you are live in a small store (`view`) that the columns read when they mount
  or get their data, not in state: the direction used to be a prop of every column.
- **`now`** (`nowMin()`) is read at each render and only today's column gets it.

**A grid tap peeks first** (guide 'Plan: a fast Rooster tab', Phase 2). `Calendar` makes a `Sheet.SheetPeek` for each of
the three grid sheets (`peeks`: `GridPeeks`) and gives it to the sheet and to `DayGrid`. The grid starts the right one's
peek on the UI thread as the finger lifts, then calls `onPressLesson`/`onPressOverlap`/`onPressTogether` with `peek`:
`answer(kind, peek)` sets that sheet's content but keeps it `peeking` (shown, not open: no scrim, no touches) and puts any
other peek away (`putAway`). When the double tap's window runs out the grid opens it fully and calls `onPeekOpen`:
`peeking` goes to null, the sheet is `visible`. A double tap instead: `onDoubleTap` zooms and forgets the pending sheet.
`answered` (a ref, not state) is what the last grid tap turned out to be: the UI thread's next step can come before React
has rendered the answer. Screen readers (no `peek`) and the `OverlapSheet` → `LessonSheet` hand-off open fully at once.

**The hours glide** (`GridZoom`): `zoomH0`/`zoomPph` are the hours as they are on screen. A layout effect (before the first
paint, so the first frame still shows the old hours) animates them to React's new hours in 250 ms (`ZOOM`) when the hours
change (a zoom, a swipe to a day with an earlier lesson), and sets them directly when only the size changes. `zoomRange`
(the days in view) is set on every move. `DayGrid`'s blocks, its hour lines and the `TimeAxis` follow them.

## `Calendar`

As above. `onView` tells the screen the first day, the number of days and whether it's not the standard view
(the Rooster tab's 'Reset' and the eyebrow); `control.reset()` goes back to the standard view.

**Skipping**: drag a class into the bin (`SkipDrag`, the card and bin drawn over the grid) or 'Skip this class' in
its sheet. `doSkip` keeps the day as it was (lessons and shared breaks) to say what changed, shows `SkipToast`
right away (your breaks first, friends once the server answers) and Undo takes the last skip back (`unskip`, also
'I'll go after all' in a skipped class's sheet).

## `CalendarView`, `CalendarControl`

What `onView` reports, and what `control` can do.

## `rangeLabel`

"19 – 23 okt", "28 okt – 3 nov", "di 20 okt": always one short line (eyebrow, Vergelijken's subtitle).

## `Tip`

A small dark tip with 'Oké', over the content but never the whole screen.

## `putAway`

A grid sheet that shouldn't be there (peeking, or opened by the UI thread while JS found nothing to show): out of sight.

## `HOURS`, `AXIS_W`, `DEFAULT_LEGEND`, `hoursFor`

Hours always on screen (8–18, lessons stretch them), the width of the hours on the left, and what the legend shows before
anything is loaded. `hoursFor`: the hours of the visible days, from their `bounds` (zoomed: only those of the lessons).
How far ahead a shared break can be asked for (`ASK_DAYS`) moved to `DayCache`.
