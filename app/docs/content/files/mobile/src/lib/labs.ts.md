---
updated: 2026-10-30T12:30:00Z
---

**Experiments (A/B tests) you turn on yourself**, under Ik → Experimenten (`app/(tabs)/ik.tsx`). Each is a
`lib/store.createStore` value saved in `prefs` on this phone (not on the server), off until you turn it on; screens read
it with its hook and update the moment it's flipped. Loaded once at start in `app/_layout.tsx`, before the splash screen
goes, so a screen never starts with the wrong value. When an experiment becomes the default (or is dropped), remove it
here, its row in Ik and its texts (`me.weekDrag*`).

## `weekDrag`, `useWeekDrag`, `setWeekDrag`

**Vertical calendar dragging** (pref key `rooster.weekDrag`, default `false`): dragging the week strip's active days
up or down shows the week before or after and goes there (`components/timetable/DayStrip.tsx`, its `weekDrag` prop).
`Calendar.tsx` reads it with `useWeekDrag()` and passes the boolean to `DayStrip`; `setWeekDrag(on)` sets it and saves it.

## `loadLabs`

Reads the saved experiments at start (`app/_layout.tsx`, next to `loadLanguage`).

## `WEEK_DRAG_KEY`

The `prefs` key, `rooster.weekDrag`.
