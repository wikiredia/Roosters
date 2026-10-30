---
updated: 2026-10-30T15:05:34Z
---

**Who you could spend a break with**, opened from the calendar (`timetable/Calendar.tsx`, so the Rooster tab and
Vergelijken) when you tap a break. Two cases, same rows:

- **A shared break** (yellow): "Pauze mogelijk met:", the friends free then (`Calendar.askBreak` works them out from the
  day's `raw` shared breaks), each with their own free window under the name.
- **Your own break with nobody** (the grey gap with the coffee cup, `TapTargets.TAP_ALONE`): "Meestal ga je met:",
  `useUsualPartners()` (`GET /breaks/usual`), fetched only while this sheet is open for it. The sub line says how many
  breaks you had together, or 'Vastgezet' for a pinned friend that fills up the list (count 0). Nobody: a short line that
  sends you to the chat.

The sheet's subtitle is the day and the stretch you tapped. A row (avatar, name, sub line, chevron) opens your one-to-one
chat with that friend (`useOpenDirect`, then the sheet closes and `/chat/<id>` is pushed, so back returns to the
calendar); a second tap while that's on its way is ignored. The Vergelijk button (`swap`) on the right closes the sheet
and opens `/compare?ids=<id>`; it's its own Pressable, so it never opens the chat. Asking for the break itself happens
in the chat now (its "Pauze samen?" suggestion and `BreakSheet`), not from the calendar.

Like the calendar's other sheets it is `memo` and keeps showing the last content while it slides away (`Sheet` stays
mounted until then).

## `PeopleSheet`

`target` (or null: closed) and `onClose`, which must keep its identity (`Calendar` passes a `useCallback`).

## `PeopleTarget`

`{kind: 'together', day, start, end, people}` (`people` are `BreakSheet.BreakPick`s: a friend with their window) or
`{kind: 'usual', day, start, end}`; `day` is ISO, `start`/`end` minutes.
