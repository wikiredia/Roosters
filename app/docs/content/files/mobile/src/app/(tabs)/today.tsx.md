---
updated: 2026-10-24T05:27:10Z
---

**Today**: where you are now, who you can take a break with, who is around. One request (`GET /me/today`,
refetched every minute, ETag). Sections fade in (the skeleton cross-fades into them) and slide when one above
appears or goes (`Motion.Reveal`).

Sections from top to bottom: sync note, **Now card**, **Complete the following steps** (`SetupSteps`, for
what onboarding skipped), **break requests**, shared breaks ('together'), the now-board, your plan for the afternoon
(check-in), timetable changes, 'updated … ago'. The 'At school / At home' button sets the check-in.

## `Board`

'Who's around': free first, people not on campus folded into one row.

## `Changes`

Recent timetable changes for today and later (from notifications).

## `Loading`

Skeleton for the very first load (never a spinner).

## `NowCard`, `TomorrowLine`

The big blue card: in class until / break until / first lesson at / done, with the next lesson; 'Tomorrow you start at 08:30' from the cached next school day.

## `PLAN`

The afternoon plan options (check-in statuses) and their labels and icons.

## `Plan`

Your status for friends this afternoon (chilling, want to chill, going home, absent).

## `SyncNote`, `Updated`

A calm note when Untis didn't answer (last known timetable stays), and 'Updated 4 min ago'.

## `T`

The type of `t()` passed to the parts below.

## `TodayScreen`

Puts the sections together; pull to refresh (the spinner only for your own pull).

## `Requests`

'Pauzeverzoeken': asked to you (Ja / Nee / Ander uur, which opens `BreakSheet` for another time), asked by you
(waiting, planned, or nobody can: take it back or remove it), and the ones you said yes to (Toch niet). A no you gave
is gone. Hidden when there are none.

## `Together`

'Take your break with': shared breaks grouped per time slot; tap one to ask "Pauze samen?" (`BreakSheet`, from now on
when it's already going).
