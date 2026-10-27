---
updated: 2026-10-24T10:30:00Z
---

**Rooster**: your days in the calendar (`components/timetable/Calendar.tsx`: swiping, pinching, zoom, sheets, all
of it lives there), with every friend's shared breaks. The eyebrow ('26 – 30 okt') follows what the calendar shows.
**Reset** (was 'Terug'; also what a double tap on the calendar does): once the view isn't the standard one (zoomed, not 5 days, or not starting on a Monday) the title
'Rooster' slides out and 'Reset' (the arrow curling left) slides in; it calls `control.reset()`: this week,
Monday to Friday, zoomed out. **Vergelijk** (top right, a primary-colour button so it stands out) opens `app/(tabs)/compare.tsx`.

## `RoosterScreen`

The tab, as above.

## `TitleOrBack`

The large title, or the 'Reset' button in its place: the one slides out as the other slides in. Passed to `Screen`
as `heading`.
