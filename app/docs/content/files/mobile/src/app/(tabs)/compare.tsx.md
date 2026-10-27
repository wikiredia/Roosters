---
updated: 2026-10-24T13:40:00Z
---

**Vergelijken**, in two steps that slide sideways:

1. **Who**: tick friends (up to 3 for free, more is Premium later: the first 3 are used and it says so).
   'Vergelijk (n)' at the bottom. On top **Voor jou**: the friends you pinned (each with a thumbtack, `PinMark`),
   then the ones you compare with most (counted on this phone, `compare.picks`; no history yet: the ones you share
   most breaks with), 3 in all or every pinned one, with how many breaks you share in that week. Only those show a
   count: seeing it for everyone is what comparing is for. The rest below in the API's order (pinned first, by name).
2. **The week**: the same calendar as the Rooster tab (`components/timetable/Calendar.tsx`, every feature: swipe,
   pinch, double tap = reset, tap a shared break to ask) with only the shared breaks with the friends you picked. It opens
   on the current **lesson week**, Monday to Friday, or the next one when your lessons of this week are over
   (Friday afternoon, the weekend): `lessonWeek`. The row on top ('Jij en Kayra · Wijzig') and the back button go
   back to step 1.

It lives inside the tabs (hidden tab, `href: null`) so the bottom bar stays visible; Rooster stays lit.

With `ids` (a friend's page, the chat's +) it opens on step 2 straight away.

## `MAX_FREE`, `CompareScreen`

The free limit (same as the server) and the screen.

## `lessonWeek`

The Monday to show: this week while you still have a lesson ahead in it (a skipped one doesn't count), otherwise next week.
