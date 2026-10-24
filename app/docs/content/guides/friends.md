---
title: Friends, breaks, chat and privacy
position: 40
updated: 2026-10-24T13:40:00Z
---

## Becoming friends

- **Invite link** (`<PUBLIC_URL>/i/<code>`, `r_friends.my_invite`): works across schools; 30 days, 50 uses.
- **Request** to someone from **your school** (`send_request`), or from the classmates list (people in
  your classes).
- Friendship is mutual: two rows in `friendships`, one per direction.

## What a friend sees

Each side chooses per friend: the **full** timetable, everything **without rooms**, or **free/busy** only (`edit_friend`;
`schedule.busy_only` merges busy blocks and drops what and where). **Ghost mode** hides you completely for a
while. **Blocking** ends the friendship and is silent (the other side can't tell). Guests are invisible.

Every feature that shows one person's data to another must go through `friends.visible_friends` /
`friendship`, so these rules apply.

## Pinned friends

Pin the few friends you care about most and they come first wherever friends are listed: the friends list (their own
card, 'Vastgezet · bovenaan in Vandaag'), Today's board (on top, also when they're not on campus), the names of a
shared break, Vergelijken's 'Voor jou', and every picker that keeps the API's order (new group, adding to a chat, the
Chat tab's friends). A pin is **only yours**: it's `friendships.pinned` on your own row (migration `0014`), set with
`PATCH /api/v1/friends/{id}` `{pinned}` (`r_friends.edit_friend`, `friends.set_pinned`); nothing a friend can ask
reads it. It goes with the friendship (unfriending, blocking, deleting the account), is in the export, and has no
cap (like pinned chats). 'Voor jou' break questions on Today stay in time order: the soonest one needs an answer
first. App: the thumbtack on each row of `app/friends/index.tsx`, the 'Vastzetten' toggle on `app/friends/[id].tsx`,
`PinMark` (`components/ui/Bits.tsx`), `lib/friends.ts`, `usePinFriend`.

## Breaks together (logic.py)

- A break is time without class **between** your first and last lesson; check-ins change that (chilling
  extends it, going home cuts it, absent removes the day).
- Shared break: overlap of 30+ minutes on the same campus, 31+ on different campuses.
- Today shows your partners (`logic.partners`) and the now-board (`logic.board_status`). Compare shows
  every group of 2+ people that shares a break (`logic.compare_matches`), with up to 3 friends for free.
- **Skipping a class** (`r_me.skip`, table `skipped_lessons`) makes that time free: `schedule.takes_place` leaves the
  lesson out of everything that decides when you're busy, so your breaks grow and friends can share that time with
  you. Friends only see free time, never that you skipped. In the app: drag a class into the bin or 'Skip this class'
  in its sheet, then a short summary of what changed with a 5-second Undo (`mobile/src/lib/skips.ts`,
  `components/timetable/SkipDrag.tsx`, `SkipToast.tsx`).

## Break requests (breaks.py)

Tap a shared break and ask "Pauze samen?": I come, you come or meet somewhere, from–until, a note. Only friends
who can see you; everyone must be free then; no asking the same people twice for the same time (from either side).
They answer yes, no or another time; the asker can take it back. Unfriending or blocking makes requests disappear.
Every step leaves an in-app notification and a push (`push.py`; a request comes with Ja / Nee on the phone); a yes
also shows up in the chats the two share.
App: `components/BreakSheet.tsx`, Today's 'Voor jou' (questions to you) and 'Jouw pauzes'.

## Chat (chat.py)

One-to-one chats between friends (only while you're friends; one per pair) and groups of friends (anyone in it adds
their own friends, anyone can leave). Text messages and events (a group made, someone added or gone, a renamed group,
a planned break); the app writes the event sentences. Unread counts and "gelezen" come from how far each person read.
Moderation, required by the stores for chat: long press → **report** ("Meld dit bericht": why, a note, block too)
or **block**; nobody is told. Someone you blocked is gone from your chats (also in groups). Reports go to the admin
API (`/admin/v1/reports`: dismiss, remove the message, turn the writer off). Sending carries an Idempotency-Key,
so a message retried on bad wifi is stored once. App: `(tabs)/chat.tsx`, `chat/[id].tsx`, `chat/new.tsx`,
`components/chat/`. Push per chat: the bell in a chat's info sheet (only for you, off by default; `push.py`).

Tests: `api/tests/test_friends.py`, `api/tests/test_logic.py`, `api/tests/test_compare.py`, `api/tests/test_breaks.py`,
`api/tests/test_chat.py`.
