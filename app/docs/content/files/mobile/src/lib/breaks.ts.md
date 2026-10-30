---
updated: 2026-10-30T13:30:00Z
---

Words for **break requests** (`components/BreakSheet.tsx`, the 'Pauzeverzoeken' section on Today).

## `otherPeople`

Whoever you asked, or whoever asked you.

## `howText`

Who walks, seen by you: the API stores it as the asker put it, so "I come to you" from Reda reads "Reda komt naar
jou" for Kayra and "jij gaat naar Kayra" for Reda; a place reads "op cafetaria".

## `dayWord`

'Vandaag', 'Morgen' or a short date.

## `breakError`

What went wrong in words: who can't then and why (`break_busy` names them: class, gone home, no classes, or busy in their break), that you can't yourself, that it was
asked already (by you, by them, or that it's planned), offline, or the server's message.

## `duration`

"45 min", "1 u", "1 u 30": how long a free window lasts (the rows of `BreakSheet`).

## `stateWith`, `WithState`, `RANK`

Where you stand with one friend about a break that overlaps a time on a day: planned, asked (you asked, no answer),
theirs (they asked you), declined; the strongest when several requests overlap. `BreakSheet` shows it per person
and won't ask twice.

## `slotState`

A shared break with several friends as one block (calendar, Today): planned when one of them is, asked while a
question is open, declined only when every one of them said no.
