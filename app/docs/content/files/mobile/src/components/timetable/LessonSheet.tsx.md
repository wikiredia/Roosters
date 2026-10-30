---
updated: 2026-10-30T15:52:00Z
---

Tap on a lesson: when, its **details** (Type, Building, Floor, Classroom, Group, ... after the layout of the lesson's
origin: `lib/details.detailRows` with `api/hooks.useDetails`; titles, merges and hidden fields as the student set them
in `app/onboarding/details.tsx`; a lesson without a known origin gets Type, Location, Group), and who else is free if
it's cancelled ('Ook vrij': a row per friend, their name and 'tot 12:30'; tapping one closes the sheet and opens your one-to-one chat with them,
`useOpenDirect`, not their profile). `LessonSheet`, `OverlapSheet` (and `BreakSheet`) are
`memo`, and `Calendar` gives them callbacks that keep their identity, so opening one renders only that sheet.

## `OverlapSheet`

'Welke les?': the lessons of a tapped overlap in time order (kind colour, time, kind, room). Picking one closes it
and the screen opens that lesson's `LessonSheet`.

## `Props`, `LessonSheet`

A bottom sheet. Keeps the last lesson while it slides away (`lesson` becomes null when it closes). With `onSkip`:
'Skip this class' for a class still to come (`lib/skips.canSkip`), with a hint that dragging is quicker; a skipped
one says so, lists who's free then (like a cancelled one) and has 'I'll go after all' (`onUnskip`).
