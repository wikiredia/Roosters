---
updated: 2026-10-30T08:11:38Z
---

**Today**: where you are now, who you can take a break with, who is around. One request (`GET /me/today`,
refetched every minute, ETag). Sections fade in (the skeleton cross-fades into them) and slide when one above
appears or goes (`Motion.Reveal`).

Sections from top to bottom: sync note, **Now card**, **Voor jou** (questions to you), **Complete the following
steps** (`SetupSteps`, for what onboarding skipped), **your breaks**, shared breaks ('together'), the now-board, your plan for the afternoon
(check-in), timetable changes, 'updated … ago'. The 'At school / At home' button sets the check-in.

## `Board`

'Who's around': friends you pinned on top with a thumbtack (`PinMark`), always as their own row, also when they're
not on campus ('bovenaan in Vandaag'); then free first; the others not on campus folded into one row. The server
sorts it the same way; `lib/friends.pinnedOnTop` here keeps a pin you just set in place before Today comes back.

## `Changes`

Recent timetable changes for today and later (from notifications).

## `Loading`

Skeleton for the very first load (never a spinner).

## `NowCard`, `TomorrowLine`

The big blue card: in class until / break until / first lesson at / done, with the next lesson. Lessons are merged first
(`Timetable.mergeLessons`, as in the Rooster tab), so a double period is one class and 'Next' is never the same class
an hour later; 'until' for the class you're in is the end of *that* class (`cur.end`), not `status.until`, which is the end
of the whole run of back-to-back classes (that is what friends see); 'Tomorrow you start at 08:30' from the cached next school day.

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

## `ForYou`

'Voor jou' with '1 vraag' (design: Today.dc.html): breaks friends asked you for and you haven't answered, right
under the Now card. "Lotte: pauze om 12:30?" (another day: "pauze morgen om …"), until when and where, their note,
Ja / Nee / Ander uur (opens `BreakSheet` for another time). Hidden when nobody asked (or the API is older and sends no `breaks`).

## `Requests`

'Jouw pauzes': asked by you (waiting, planned, or nobody can: take it back or remove it) and the ones you said yes
to (Toch niet). A no you gave is gone; open questions are in `ForYou`. Hidden when there are none. One plain white
card, planned first, then waiting, then nobody can: each row has a small tag in its state's colour (`STATE_TAG`, the
same as the calendar's legend) and its action as a small text button on the right. Kept calm on purpose: no coloured
or hatched cards, no button per row taking a whole line.

## `Together`

'Take your break with': shared breaks grouped per time slot, pinned friends named first in each; tap one to ask "Pauze samen?" (`BreakSheet`, from now on
when it's already going). A slot with one friend has a chat button (their one-to-one chat, `useOpenDirect`).

In 'Pak je pauze met' a row says (with the same small tag) when you already asked, planned or got a no.

## `STATE_TAG`

A break's state as a `Tag` kind: planned yellow with a check, asked outlined, nobody can soft red.
