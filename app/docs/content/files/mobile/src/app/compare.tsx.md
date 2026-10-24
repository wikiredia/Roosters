---
updated: 2026-10-24T11:30:00Z
---

**Vergelijken**, in two steps that slide sideways:

1. **Who**: tick friends (up to 3 for free, more is Premium later: the first 3 are used and it says so).
   'Vergelijk (n)' at the bottom. On top **Voor jou**: the 3 you compare with most (counted on this phone,
   `compare.picks`; no history yet: the 3 you share most breaks with), with how many breaks you share in that week.
   Only those 3 show a count: seeing it for everyone is what comparing is for.
2. **The week**: the same calendar as the Rooster tab (`components/timetable/Calendar.tsx`, every feature: swipe,
   pinch, double tap, tap a shared break to ask) with only the shared breaks with the friends you picked. It opens
   on the current **lesson week**, Monday to Friday, or the next one when your lessons of this week are over
   (Friday afternoon, the weekend): `lessonWeek`. The row on top ('Jij en Kayra · Wijzig') and the back button go
   back to step 1.

With `ids` (a friend's page, the chat's +) it opens on step 2 straight away.

## `MAX_FREE`, `CompareScreen`

The free limit (same as the server) and the screen.

## `lessonWeek`

The Monday to show: this week while you still have a lesson ahead in it, otherwise next week.
