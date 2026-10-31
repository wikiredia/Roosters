---
updated: 2026-10-31T16:25:00Z
---

**Vergelijken**, in two steps that slide sideways:

1. **Who**: tick friends (up to 3 for free, more is Premium later: the first 3 are used and it says so).
   'Vergelijk (n)' at the bottom. On top **Voor jou**: the friends you pinned (each with a thumbtack, `PinMark`),
   then the ones you compare with most (counted on this phone, `compare.picks`; no history yet: the ones you share
   most breaks with), 3 in all or every pinned one, with how many breaks you share in that week. Only those show a
   count: seeing it for everyone is what comparing is for. The rest below in the API's order (pinned first, by name).
2. **The calendar**: the Rooster tab's own screen and calendar (`components/timetable/CalendarScreen.tsx`: the same
   code, so the same controls, gestures and height) in compare mode: every day has a lane per person
   (`components/timetable/Lanes.ts`): you as on the Rooster tab (shared breaks only with them), then each friend in
   their own colour. No legend: top right their faces (`Faces`), each with a ring in their colour, and + back to step
   1. Tap a friend's class for its details (`LessonSheet`, no skipping); drag it into the bin to ask whether they'd skip
   it. A lane with nothing that day is narrow, 'Leeg'. It starts on today (next Monday at the weekend, `firstDay`)
   with two days, one with three friends (`startDays`); pinch or drag the strip for more. **Back arrow** before the
   title: back to step 1 when you came from there, else closes Vergelijken. **Swiping back is off** on the calendar
   (`gestureEnabled: false`): it got mixed up with swiping through the days.

`lessonWeek` is still what the shared-break counts in step 1 are about.

It is a pushed screen that renders `components/BottomTabs.tsx` itself (Rooster lit), so the bottom bar stays visible; a tab press goes back to the tabs.

With `ids` (a friend's page, the chat's +) it opens on step 2 straight away.

## `MAX_FREE`, `CompareScreen`

The free limit (same as the server) and the screen.

## `startDays`, `firstDay`

How many days the calendar starts with, and on which day (see above).

## `Faces`

The faces top right, ringed in their colour, and +.

## `lessonWeek`

The Monday the counts in step 1 are about: this week while you still have a lesson ahead in it (a skipped one doesn't count), otherwise next week.
