---
updated: 2026-10-31T20:17:00Z
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
  `days.learned`). Whichever way, **the day on the left stays on the left**: zooming out adds days on the right (it
  never goes back in time), zooming in narrows towards that first day. With `remember` (Rooster) it's remembered (`rooster.days`), 7 when this week's weekend is
  busy; Vergelijken starts on `initialDays` and no tips.
- **Zoom**: double tap on the grid stretches the hours to your lessons; double tap again or the magnifier undoes it.
  **Dragging on the hour axis** zooms the hours by hand (`range`): the top half of the axis moves the first hour, the
  bottom half the last one, an hour per hour-height as the axis was when you touched it (at least `MIN_SPAN` hours
  stay). It is smooth: the gesture runs on the UI thread and moves the hours a fraction at a time (`axisLive`), the
  axis labels and the grid (`DayGrid.LiveBody`) follow your finger pixel by pixel; only when the nearest whole hour
  changes is the layout redone (one `setRange`, a light tap), and letting go springs to the whole hour (`AXIS_SETTLE`).
  The first and last hour on the axis sit on a light rounded patch (`TimeAxis` `handles`): they look draggable. `range` wins over
  the standard and the zoomed hours, makes the view 'custom' (the Rooster tab's 'Reset') and is undone by the magnifier,
  a double tap or Reset.
- **Reset**: double tap on the day strip above the grid = the Rooster tab's 'Reset' (standard view: this week, Monday to Friday, not zoomed).
- **Vandaag** (`TodayPill`) when you've moved away from today and from where it opened (`initialStart`).
- **Shared breaks** are yellow blocks with who they're with (`Timetable.TogetherBlock`). With `only` just the
  friends you picked (Vergelijken). One that's over, or further ahead than you can ask (more than 13 days:
  `api breaks.MAX_DAYS_AHEAD`), is **hatched** (`muted`) and a tap does nothing: you can't ask for it, so the app
  doesn't let you try. Tapping a yellow one opens `PeopleSheet` "Pauze mogelijk met:" (`askBreak` → `PeopleSheet.breakTarget`: your
  whole break as a mini timetable of who's there when, and the friends in it, each with their own free window, today
  from now on); a row there opens your chat with that friend, where you ask.
- **Today's plan** (`useToday().data.me.checkin`) goes to `useDays` as a memoised `DayCache.DayPlan`: staying after
  school makes after school a grey break of yours today, "Ik ben bezig" in your breaks makes today's breaks between
  classes not yours (not drawn, not tappable). Only today's day is rebuilt when it changes.
- **Your own break with nobody** (a free gap with the coffee cup where no shared break is drawn, today from now on or
  later): tapping it does the same (`onPressAlone` → `askBreak`): who joins later in it, or, with nobody at all,
  "Meestal ga je met:" (`useUsualPartners`). The calendar no
  longer opens `BreakSheet` itself (Today and the chat still do).
- Each shared break shows what you did with it (asked, planned, declined: `lib/breaks.slotState` over `useBreaks`).
- **Vergelijken** (`compare`: friend ids): every day split into a lane per person (`Lanes.withLanes` over the friends'
  weeks from `useFriendWeeks` and your open skip questions from `useSkipAsks`), shared breaks only with them (`only`),
  **no legend**. A friend's class tapped: `LessonSheet` without skipping (and without "who's free"). Dropped in the bin
  (`onDropClass` with its lane): `askFriend` asks them to skip it (`useAskSkip`), with a note in `SkipToast` (`info`).
  The header above the hours is taller there (`NAME_H`, the names row), so the hours, the axis and the arrows start lower.
  `initialStart` / `initialDays` are where it starts and what Reset goes back to.
- **Arrows to where there's something**: an empty weekend at the right end of the view gets a tab on the right edge
  (below); one at the left end a tab on the left edge (next to the hours) back to Friday (Saturday when it has
  something), landing with that day on the right. **Nothing at all in view** (holidays, an empty weekend on its own):
  both tabs, to the nearest day with something on either side among the loaded days (with 5+ days: that day's week);
  none loaded: a week further, and on from there once that week is in. In Vergelijken anyone's classes count.
- **An empty weekend** at the right end of the view (nothing on Saturday and/or Sunday): a tab against the right edge of the
  screen with the day it goes to ("MA 27"). It moves the view so that day is on the left, same number of days: Sunday when
  Sunday has something (and isn't on screen yet), otherwise Monday. Its wrapper is `pointerEvents="box-none"`, so only the
  tab takes touches: the empty weekend itself can still be swiped (a full-size wrapper used to swallow the swipe, which
  looked like the calendar was locked). It fades out while you drag a class (the bin may come in on that side).
- Tapping a lesson opens `LessonSheet`; where lessons overlap, `OverlapSheet` first.
- **Experiment: vertical calendar dragging** (`lib/labs.useWeekDrag`, off unless turned on in Ik → Experimenten): passed to
  `DayStrip` as the boolean `weekDrag` (memo-friendly), which then lets you drag the strip up/down to the week before or after.

**Fast, because little renders** (guide 'Plan: a fast Rooster tab', Phase 1):
- `Calendar` is `memo`, so the Rooster screen changing its header (`onView`) doesn't render it a second time.
- **The days come from `DayCache.useDays`**: built once per week that comes in and kept while that week's data, the names,
  the breaks, `only`, today and the language stay the same. Moving `start` re-uses the weeks still in the window, and a
  refetch that changes nothing (a 304) changes nothing: `dataUpdatedAt` is not a dependency. `hours`, `legend` and `kinds`
  are read from the days' precomputed fields; nothing here calls `mergeLessons` in a render.
- **Everything below is `memo` with props that keep their identity**: `DayStrip` (it gets the `kinds` Map), `TimeAxis`,
  `DayGrid`, `DragLayer`, `TodayPill`, `SkipToast`, `Legend` and the three sheets (`OverlapSheet`, `PeopleSheet`, `LessonSheet`). The callbacks are `useCallback`s that
  read the newest state through the `latest` ref (updated in an insertion effect), and `hours` keeps its identity while
  the two numbers are the same (it is memoised on `"h0:h1"`). Opening a sheet therefore renders this component and that
  sheet; a swipe renders the columns that mount (the render counter in the fps overlay shows it).
- **Which way you went** (`heading`) and where you are live in a small store (`view`) that the columns read when they mount
  or get their data, not in state: the direction used to be a prop of every column.
- **`now`** (`nowMin()`) is read at each render and only today's column gets it.

The single tap still waits 200 ms for a possible double tap (`DayGrid`); the sheet starts sliding in the frame it appears
(`Sheet`). Both change in Phase 2.

## `Calendar`

As above. `onView` tells the screen the first day, the number of days and whether it's not the standard view
(the Rooster tab's 'Reset' and the eyebrow); `control.reset()` goes back to the standard view.

**Skipping**: drag a class into the bin (`SkipDrag`, the card and bin drawn over the grid; the bin comes in on the half
opposite where you picked the class up) or 'Skip this class' in
its sheet. `doSkip` keeps the day as it was (lessons and shared breaks) to say what changed, shows `SkipToast`
right away (your breaks first, friends once the server answers) and Undo takes the last skip back (`unskip`, also
'I'll go after all' in a skipped class's sheet).

## `CalendarView`, `CalendarControl`

What `onView` reports, and what `control` can do.

## `rangeLabel`

"19 – 23 okt", "28 okt – 3 nov", "di 20 okt": always one short line (eyebrow, Vergelijken's subtitle).

## `Tip`

A small dark tip with 'Oké', over the content but never the whole screen.

## `AXIS_W`, `MIN_SPAN`, `DEFAULT_LEGEND`, `hoursFor`

The hours always on screen are `DayCache.HOURS` (8–18, lessons stretch them); `AXIS_W` is the width of the hours on the left, the fewest hours the axis can be
dragged down to (`MIN_SPAN`), and what the legend shows before anything is loaded. `hoursFor`: the hours of the visible days, from their `bounds` (zoomed: only those of the lessons).
How far ahead a shared break can be asked for (`ASK_DAYS`) moved to `DayCache`.
