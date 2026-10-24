---
updated: 2026-10-24T05:26:38Z
---

**"Pauze samen?"**: the sheet that asks friends to spend a shared break together, opened by tapping a shared break on
Today ('Pak je pauze met') or in the Rooster grid. Who (chips when you share it with several friends; the time
follows what everyone you picked has free), how (I come / you come / meet, with a place), from–until in steps of
5 minutes within the break, and a short note. **'Ander uur'** on a request you got uses the same sheet: any time that
day, sent with `useAnswerBreak` (`counter`). The server checks that everyone is free and nobody asked already; what's
wrong shows above the button in words (`lib/breaks.breakError`). 'Vergelijk roosters' goes to Compare with the same
people. API: `api/roosters/breaks.py`.

## `BreakSheet`, `BreakTarget`, `BreakPick`

The sheet; what it's for (`ask` with the day and the people, each with their own free window, or `counter` with the
request you answer; null = closed); a friend with their window. It keeps showing the last target while it slides away.

## `Form`

The fields, fresh for every new target (keyed).

## `TimeRow`

"Van 10:30 − +": one 'adjustable' control for screen readers.

## `STEP`, `DAY_SPAN`

5 minutes a tap; another time may go from 07:00 to 22:00.
