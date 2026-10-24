---
updated: 2026-10-24T12:55:00Z
---

**Skipping a class**, the pure parts: what a skip covers, the cache before the server answers, and the summary of what
a skip changes (the lines in `components/timetable/SkipToast.tsx`). The server side is `PUT /api/v1/me/skips`
(`api/roosters/r_me.py` `skip`); the request itself is `api/hooks.ts` `useSkip`.

## `SkipTarget`, `skipTarget`, `inSkip`

A skip is one course on one day from the start to the end of the whole block the grid draws, so a double period
(merged by `Timetable.mergeLessons`) goes in one go and is taken back in one go. `inSkip`: does a lesson fall under it.

## `withSkip`

The lessons with a skip on or off, as the server will answer (`skipped`, and `busy` false while skipped): the
optimistic cache of `useSkip`, and the "after" of `skipChanges`.

## `canSkip`

A lesson you can skip: yours (it has a course), it takes place (not cancelled, not skipped already) and isn't over.
The grid only lets those be dragged (`DayGrid`), and the lesson sheet only offers 'Skip this class' for those.

## `SkipChange`, `skipChanges`, `T`

The summary after a skip, in a few lines with an icon each: an exam warning (red), your break around it (longer, with
what it was, or a new one), a later start or an earlier finish, or a day off; then per friend a shared break during
that time that is new or longer than before (the same window grouped: "Kayra and Lotte"), or that nobody is free.
Friends come from the server's answer (`after`); until it's there one line says it's checking. Comparing with
`before` (the day's shared breaks from the cache) is what makes "longer" possible.
