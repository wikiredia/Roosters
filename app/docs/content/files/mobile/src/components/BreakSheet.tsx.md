---
updated: 2026-10-30T10:27:00Z
---

**"Pauze samen?"** (`memo`, so a screen that re-renders without a new `target` or `onClose` doesn't render it): the sheet that asks friends to spend a shared break together, opened by tapping a shared break on
Today ('Pak je pauze met') or in the calendar (Rooster, Vergelijken). Three short pages that slide sideways, a back
arrow in the title row:

1. **Who**: a row per friend (photo, name, from–until, how long, an arrow), also when there's only one; with
   several free at the same time also 'Allemaal (n)' with the window they share. Someone you already asked, have a
   break planned with, or who asked you, has a tag ('Gevraagd', 'Gepland', 'Vraagt jou') and can't be picked: no
   asking twice (the server would refuse it). 'Zei nee' can be asked again.
2. **How and when**: I come / you come / meet (with a place), from–until in steps of 5 minutes within the break,
   'Volgende'.
3. **A note**, and 'Vraag het'. What the server refuses (someone has class, it was asked already) shows here in words
   (`lib/breaks.breakError`).

**After sending** (ask or counter) the sheet closes and goes where the card went (`BreakAnswer.chats`): one chat →
`router.push('/chat/<id>')` (the back arrow returns here); several → the Chat tab. When the sheet was opened on top
of that very chat ('Ander uur' on a card), it compares with `usePathname()` and stays instead of pushing it again.

**'Ander uur'** on a request you got uses the same sheet from page 2: any time that day, sent with
`useAnswerBreak` (`counter`). API: `api/roosters/breaks.py`. Shared breaks you can't ask for (over, too far ahead)
never open it: they're hatched in the calendar.

## `BreakSheet`, `BreakTarget`, `BreakPick`

The sheet and its page (`Step`, `ORDER`); what it's for (`ask` with the day and the people, each with their own
free window, or `counter` with the request you answer; null = closed); a friend with their window. It keeps
showing the last target while it slides away; a new target starts on its first page.

## `Form`

The fields, fresh for every new target (keyed); each page slides in from the side you're going to. `send` does
the request and the navigation above.

## `Summary`

Who, which day, from–until: on top of pages 2 and 3.

## `TimeRow`

"Van 10:30 − +": one 'adjustable' control for screen readers.

## `STEP`, `DAY_SPAN`, `Step`, `ORDER`, `T`

5 minutes a tap; another time may go from 07:00 to 22:00; the pages in order.

## `STATE_TAG`

How each state shows in the list, and whether you can ask again.
