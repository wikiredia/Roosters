---
updated: 2026-10-30T15:52:00Z
---

**Today**: where you are now, who you can take a break with, who is around. One request (`GET /me/today`,
refetched every minute, ETag). Sections fade in (the skeleton cross-fades into them) and slide when one above
appears or goes (`Motion.Reveal`).

Sections from top to bottom: sync note, **Now card**, **Nog te doen** (`SetupSteps`, for what onboarding
skipped), shared breaks ('Pauze samen'), the now-board, your status ('Jouw status': Pauze / Na school / Vandaag
afwezig), timetable changes, 'updated … ago'. The 'At school / At home' button sets the check-in (`status: 'home'`).

**Little to read** (the owner asked for it): facts in rows and short labels, not sentences, and no name written
out where the avatar, the chat or the page already says who. The time comes first wherever rows differ by time
(the Now card's 'VOLGENDE 13:00 Python · A1', the shared breaks). An explanation is a few words that show up only
when it matters (under a picked status choice), never a paragraph.

Break requests (asked, to answer, planned) are not listed here any more: each one is a card in a chat
(`components/chat/…`, contract 'requests in the chat'). Tapping a friend here (board row, the state tag in 'Pauze
samen') goes to the chat with them, not their profile.

## `Board`

'Wie is er nu?' with how many are free on the right ('2 vrij'): tap a friend for your one-to-one chat with them (`useOpenDirect`, then `/chat/<id>`). Friends you pinned on top with a thumbtack (`PinMark`), always as their own row, also when they're
not on campus ('bovenaan in Vandaag'); then free first; the others not on campus folded into one row. The server
sorts it the same way; `lib/friends.pinnedOnTop` here keeps a pin you just set in place before Today comes back.

## `Changes`

Recent timetable changes for today and later (from notifications).

## `Loading`

Skeleton for the very first load (never a spinner).

## `NowCard`, `TomorrowLine`

The big blue card, the whole of it a button to the Rooster tab (a chevron top right, no separate button): in class
/ break until / first lesson at / done as the title, then short facts with an icon (clock 'tot 11:45', pin 'B204';
for 'later' the first course and room), a 'Vervalt' pill with cancelled courses (only those Roosterwijzigingen
below doesn't list already, so nothing is said twice), and at the bottom the next lesson as one line, time first
('VOLGENDE 13:00 Python · A1'). Lessons are merged first (`Timetable.mergeLessons`, as in the Rooster tab), so a
double period is one class and 'Next' is never the same class an hour later; 'until' for the class you're in is the
end of *that* class (`cur.end`), not `status.until`, which is the end of the whole run of back-to-back classes (that
is what friends see). Done or no classes: the same line for the next school day ('MORGEN 08:30 Wiskunde', from the
cached Today of that day). Weekend: 'Vrienden zien je status niet' as a fact under the title.

## `Pill`, `NextLine`

The see-through label on the blue card ('NU', 'Vervalt'), and its bottom line: a small label, the time in bold, then
course · room.

## `BREAK`, `AFTER`, `Status`, `BreakStatus`

The choices of the two parts of `Plan` and their labels, one or two words so two fit next to each other:
`break_status` want_chill ('Afspreken') / busy ('Bezig'); `status` chilling ('Blijf nog') / want_chill ('Wil
chillen').

## `Plan`, `PlanPart`

Your own status for friends: one card under 'Jouw status · Vrienden zien dit', two parts (`PlanPart`: name and time
on one line, the choices under it) and a toggle row. It replaced 'Wat is je plan deze middag?' + 'Geldt tot …',
which the owner found silly, and later a paragraph explaining it all: now only the picked choice says what it does,
in a few words ('Bezig' → 'Niemand wordt aan je gekoppeld'; staying after school → 'Telt als pauze: we zoeken wie ook
blijft').

Both parts are **always there on a school day**, also once school is over or after 'Thuis', so you can always see
and change what you said (an earlier version hid them, and the owner wants them to stay).

- **Pauze** (`PUT /me/checkin {break_status}`), with the next break's time ('12:30–13:20', 'Nu · tot 13:20',
  or 'Geen meer vandaag'; `Timetable.freeGaps` of your lessons). Busy: nobody is matched with you in your
  breaks (they don't count as free; the board shows 'Bezig in de pauze').
- **Na school** (`{status}`), 'Vanaf 15:40' (the end of your last class you still go to: a skipped one doesn't
  count). Staying ('Blijf nog', 'Wil chillen') makes after school count as a break, so friends who stay too are
  matched with you (`logic.day_info` on the server; the Rooster tab draws it as your break, to the end of the day).
  Nothing picked = you go home after your last class.

Nothing for before school, no 'until'. Tapping the selected choice again clears it (the screen sends null).
'Vandaag afwezig' (`status: 'absent'`) is the toggle row at the bottom of the card. A day without classes: one
part, 'Toch op de campus?' (on campus / want to chill).

## `SyncNote`, `Updated`

A calm note when Untis didn't answer (last known timetable stays), and 'Updated 4 min ago'.

## `T`

The type of `t()` passed to the parts below.

## `TodayScreen`

Puts the sections together; pull to refresh (the spinner only for your own pull).

## `Together`

'Pauze samen': shared breaks, one row per time slot. The row's title is the time and how long ('12:00–13:00 · 1 u',
'Nu tot 12:30 · 25 min'), its sub line just who (comma-separated, pinned friends first): the time is what differs
between rows. Nothing shared: one quiet row 'Vandaag geen pauze samen'. Tap one to ask "Pauze samen?" (`BreakSheet`, from now on
when it's already going; after sending, the sheet goes to the chat with the card). A slot with one friend has a chat button (their one-to-one chat, `useOpenDirect`).

A row says (with a small tag, `lib/breaks.slotState`) when you already asked, planned or got a no; then tapping it
opens the chat where that request's card is instead of the sheet: one friend → your direct chat; several → the
group chat (`useChats`) whose members are exactly them, else the Chat tab (one card in each direct chat).

## `STATE_TAG`

A break's state as a `Tag` kind: planned yellow with a check, asked outlined, nobody can soft red.
