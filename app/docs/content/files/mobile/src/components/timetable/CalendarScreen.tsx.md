---
updated: 2026-10-31T16:25:00Z
---

**The screen around the calendar**, one component for the Rooster tab (`app/(tabs)/rooster.tsx`) and Vergelijken
(`app/compare.tsx`), so both always have the same controls, header and height; only the title, what's top right and
what the calendar shows differ. The eyebrow ('26 – 30 okt') follows what the calendar shows. **Reset**: once the view
isn't the standard one (zoomed or hours dragged, another number of days than it started with, or not where it started)
the title slides out and 'Reset' (the arrow curling left) slides in; it calls `control.reset()`. A double tap on the
day strip does the same. With `onBack` a back arrow sits before the title (Vergelijken, where swiping back is off).

## `CalendarScreen`

As above. `compare`, `initialStart`, `initialDays` and `remember` go to `Calendar`.

## `TitleOrBack`

The large title, or the 'Reset' button in its place: the one slides out as the other slides in. Passed to `Screen`
as `heading`.

## `RefreshButton`

The small round arrow next to the title (or 'Reset'). It fetches the timetable again **from the source** (Untis, your
calendar links), not just from our API: `useSourceRefresh` asks `POST /me/refresh`, which queues the syncs, and the
arrow turns until they are in; then the weeks and Today are fetched again. Within the API's 90 s cooldown nothing is
fetched at the source, only our API is asked again.
