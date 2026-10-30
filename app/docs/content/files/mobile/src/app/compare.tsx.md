---
updated: 2026-10-30T15:40:00Z
---

**Vergelijken**, in two steps that slide sideways:

1. **Who**: tick friends (up to 3 for free, more is Premium later: the first 3 are used and it says so).
   'Vergelijk (n)' at the bottom. On top **Voor jou**: the friends you pinned (each with a thumbtack, `PinMark`),
   then the ones you compare with most (counted on this phone, `compare.picks`; no history yet: the ones you share
   most breaks with), 3 in all or every pinned one, with how many breaks you share in that week. Only those show a
   count: seeing it for everyone is what comparing is for. The rest below in the API's order (pinned first, by name).
2. **Side by side**: you and them, a column each, for a day (or two when you're at most three people), Monday to
   Friday (`components/timetable/CompareView.tsx`: their classes, the breaks you share, tap a break for how it goes,
   drag a class of theirs into the bin to ask whether they'd skip it). The + after the last friend's card goes back
   to step 1; 'Klaar' (top right) closes Vergelijken.

`lessonWeek` is still what the shared-break counts in step 1 are about.

It is a pushed screen that renders `components/BottomTabs.tsx` itself (Rooster lit), so the bottom bar stays visible; a tab press goes back to the tabs.

With `ids` (a friend's page, the chat's +) it opens on step 2 straight away.

## `MAX_FREE`, `CompareScreen`

The free limit (same as the server) and the screen.

## `lessonWeek`

The Monday the counts in step 1 are about: this week while you still have a lesson ahead in it (a skipped one doesn't count), otherwise next week.
