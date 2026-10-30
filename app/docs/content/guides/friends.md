---
title: Friends, breaks, chat and privacy
position: 40
updated: 2026-10-30T15:52:00Z
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
cap (like pinned chats). App: the thumbtack on each row of `app/friends/index.tsx`, the 'Vastzetten' toggle on `app/friends/[id].tsx`,
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

## Requests: what counts as one, and where it lives

Everything one person asks another lives in the **Chat tab**, never on Today. The kinds there are:

| Kind | What you can do | Where |
| --- | --- | --- |
| **Break request** ("Pauze samen?", `breaks.py`) | ask; Ja / Nee / Ander uur (a counter is a new request back); take it back, remove a no, "Toch niet" after a yes | a **card in the chat**: the direct chat with each friend asked, or the group chat whose members are exactly the asker and the people asked (when one exists) |
| **Access request** ("Mag ik je rooster zien?", `access_requests`) | ask a friend to show you more of their timetable (`full` or `norooms`); they say yes (that becomes what they show you) or no; take yours back | a **card in the direct chat** |
| **Skip question** ("Volg je Python?", `skip_requests`) | in Vergelijken, drag a friend's class into the bin: asks whether they'd skip it, then you'd share a break; only you see it as skipped until they say yes (then it's their own skip) or no; take yours back | a **card in the direct chat** |
| **Friend request** (`friend_requests`) | send (Vriend toevoegen, classmates in onboarding); ✓ / ✗; cancel yours | **not** in a chat (a chat only exists between friends): the collapsible 'Verzoeken' section pinned on top of the Chat tab, collapsed, with a red count; the tab icon's badge counts them too. Accepting opens the new chat |

Not requests (no card, nobody approves anything):

- **What you show a friend** (full / without rooms / free-busy, ghost mode): a setting on their profile, changed only by you.
- **Statuses**: your plan for today (`checkins`: `break_status` for your breaks, want company or busy; `status` after
  school, staying or wanting to chill; home; absent) and a friend's now-status. A friend's status line shows under their
  name in your chat with them and on their profile.
- Invite links: opening one makes you friends at once.

A card is a chat message of kind `request` (migration `0016`): `user_id` is the asker, `payload` points at the request,
and the API adds the request as it is now, so the card always shows the live state and the buttons for it, plus the
Vergelijk icon (top right) for the people in it. It sits in the history like any message (full width, not pinned).
After asking (a break, Ander uur, access) the app opens that chat (several separate chats: the Chat tab); a push about
a request opens that chat too. Tapping a friend who has a status or an open request (Today's 'Wie is er nu?', the
state tag of a shared break, 'Ook vrij' in a lesson) opens your chat with them. Each chat in the list with an
open request has a small yellow 'Verzoek' tag (`requests` in `GET /chats`).

In a one-to-one chat: the friend's status under their name (in class or not, on campus or not), Vergelijk next to the
three dots, and, when you share a break this school week that nobody asked for yet (`breaks` in `GET /chats/{id}`), a
small 'Pauze samen?' suggestion right above the text box, as the newest item of the conversation (gone while the
keyboard is open). An active request that scrolls up out of view stays pinned at the top of the conversation. A card
whose break can't happen any more says so ('Niet meer mogelijk'); why only when nobody in it caused it (a new lesson,
a moved lesson: `possible`, `blocked`).

In the Rooster tab and Vergelijken, tapping a shared break lists who you can take it with ('Pauze mogelijk met:'), and
tapping a break you share with nobody lists who you usually go with ('Meestal ga je met:', `GET /breaks/usual`: the
most planned breaks in the last 8 weeks, else your pinned friends). Each row opens your chat with them (Vergelijk on
the side); asking happens there.

## Break requests (breaks.py)

Tap a shared break and ask "Pauze samen?": I come, you come or meet somewhere, from–until, a note. Only friends
who can see you; everyone must be free then; no asking the same people twice for the same time (from either side).
They answer yes, no or another time; the asker can take it back. Unfriending or blocking makes requests disappear.
Every step leaves an in-app notification and a push (`push.py`; a request comes with Ja / Nee on the phone, and
opens the chat with its card). Each request is a card in the chat (see above).
App: `components/BreakSheet.tsx` (asking, Ander uur), `components/chat/RequestCard.tsx` (the card and its answers).

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
