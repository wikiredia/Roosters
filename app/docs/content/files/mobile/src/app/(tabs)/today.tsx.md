---
updated: 2026-10-30T16:30:00Z
---

**Today**: where you are now, who you can take a break with, who is around. One request (`GET /me/today`,
refetched every minute, ETag). Sections fade in (the skeleton cross-fades into them) and slide when one above
appears or goes (`Motion.Reveal`).

Sections from top to bottom: sync note, **Now card**, **Complete the following steps** (`SetupSteps`, for what
onboarding skipped), shared breaks ('together'), the now-board, your plan ('In je pauze' / 'Na school', check-in),
timetable changes, 'updated … ago'. The 'At school / At home' button sets the check-in (`status: 'home'`).

Break requests (asked, to answer, planned) are not listed here any more: each one is a card in a chat
(`components/chat/…`, contract 'requests in the chat'). Tapping a friend here (board row, the state tag in 'Pak je
pauze met') goes to the chat with them, not their profile.

## `Board`

'Who's around': tap a friend for your one-to-one chat with them (`useOpenDirect`, then `/chat/<id>`). Friends you pinned on top with a thumbtack (`PinMark`), always as their own row, also when they're
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

## `BREAK`, `AFTER`, `Status`, `BreakStatus`

The choices of the two parts of `Plan` and their labels: `break_status` want_chill ('Ik wil afspreken') / busy ('Ik
ben bezig'); `status` chilling ('Ik blijf nog') / want_chill ('Ik wil chillen').

## `Plan`

Your own status for friends, in two parts (it replaced 'Wat is je plan deze middag?' + 'Geldt tot …', which the
owner found silly):

Both parts are **always there on a school day**, also once school is over or after 'Thuis', so you can always see
and change what you said (an earlier version hid them, and the owner wants them to stay).

- **In je pauze** (`PUT /me/checkin {break_status}`), with the next break's time ('12:30–13:20', 'Nu, tot 13:20',
  or 'Geen pauze meer vandaag'; `Timetable.freeGaps` of your lessons). Busy: nobody is matched with you in your
  breaks (they don't count as free; the board shows 'Bezig in de pauze').
- **Na school** (`{status}`), 'Vanaf 15:40' (the end of your last class you still go to: a skipped one doesn't
  count). Staying ('Ik blijf nog', 'Ik wil chillen') makes after school count as a break, so friends who stay too are
  matched with you (`logic.day_info` on the server; the Rooster tab draws it as your break, to the end of the day).
  Nothing picked = you go home after your last class.

Nothing for before school, no 'until'. Tapping the selected choice again clears it (the screen sends null).
'Ik ben er vandaag niet' (`status: 'absent'`) is a small toggle row under it. A day without classes: one part,
'Toch op de campus?' (on campus / want to chill).

## `SyncNote`, `Updated`

A calm note when Untis didn't answer (last known timetable stays), and 'Updated 4 min ago'.

## `T`

The type of `t()` passed to the parts below.

## `TodayScreen`

Puts the sections together; pull to refresh (the spinner only for your own pull).

## `Together`

'Take your break with': shared breaks grouped per time slot, pinned friends named first in each; tap one to ask "Pauze samen?" (`BreakSheet`, from now on
when it's already going; after sending, the sheet goes to the chat with the card). A slot with one friend has a chat button (their one-to-one chat, `useOpenDirect`).

A row says (with a small tag, `lib/breaks.slotState`) when you already asked, planned or got a no; then tapping it
opens the chat where that request's card is instead of the sheet: one friend → your direct chat; several → the
group chat (`useChats`) whose members are exactly them, else the Chat tab (one card in each direct chat).

## `STATE_TAG`

A break's state as a `Tag` kind: planned yellow with a check, asked outlined, nobody can soft red.
