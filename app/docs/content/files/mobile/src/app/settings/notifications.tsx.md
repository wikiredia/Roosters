---
updated: 2026-10-24T13:10:00Z
---

**Meldingen** (Ik → Meldingen): turn push on for this phone, what you want a push for, and quiet hours. The settings
live on the server (`GET/PATCH /api/v1/me/push`), so they hold for every phone you're signed in on; the bell per chat
is in the chat's info sheet. "A friend is free" and "travelling together" from the design aren't there yet.

## `NotificationsScreen`

On open: `registerPush()` without asking, to know where this phone stands. Not asked yet: a card with "Zet meldingen
aan" (now the phone asks). Turned off: the same card opens the phone's settings. No EAS project / not possible here: a
short banner. Toggles for requests, timetable changes and chat (`useSetPush`, shown at once), quiet hours on/off
(22:00–07:30 to start with) and their times.

## `QuietTime`

"Van 22:00 − +": half an hour a tap, round the clock; one adjustable control for screen readers.

## `STEP`, `DAY`, `NIGHT`

30 minutes, a day in minutes, the quiet hours you get when you turn them on.
