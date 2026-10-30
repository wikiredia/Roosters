---
updated: 2026-10-30T09:30:00Z
---

**Friends**: the social side. Friend list, visibility and pins, requests within your school, invite links,
blocking, a friend's timetable, and Compare.

**Privacy rules** (keep them when you change anything here):
- Everything needs a signed-in, **non-guest** account (`deps.verified`, 403 `verify_required`).
  The exception is the invite preview, so a guest who opens a link sees who invited them.
- Requests and the classmates list only work **within your own school**, and guests never show up.
- Blocking is silent: a blocked person gets the same answers as if nothing happened.
- A friend sees your full timetable, everything but the rooms, or only free/busy, as **you** choose
  (`edit_friend`), and nothing
  while you're in ghost mode.
- A pin is **only yours** (`edit_friend`, on your own `friendships` row): nothing a friend can ask shows it.

The rules for who sees whom are in `friends.py`; break maths in `logic.py`.
Tests: `tests/test_friends.py`, `tests/test_guests.py`.

## `INVITE_DAYS`, `INVITE_ALPHABET`, `_new_code`

Invite codes: 8 characters with no look-alikes (no 0/O, 1/I/L), so they can be read aloud; valid 30 days.

## `RequestIn`, `_requests`, `requests`

`GET /api/v1/friends/requests`: pending incoming and outgoing requests.

## `FriendPatch`, `edit_friend`

`PATCH /api/v1/friends/{id}` with `visibility` and/or `pinned` (only what's sent changes), answers with the friend:
- `visibility`: what **you** show this friend: `full`, `norooms` (what and when, never where) or `freebusy`.
- `pinned`: pin them (or not), **only for you** (`friends.set_pinned`): they come first in your friends list, on
  Today's board and in Vergelijken's suggestions. No cap, like pinned chats (`chat_members.pinned`): the app shows
  every pinned friend on top. 404 `not_friends` when you aren't friends.

## `_invite_out`, `my_invite`

`POST /api/v1/invites`: your invite link, the same one until it expires or is used 50 times; `reset=true` makes a new one and kills the old.

## `_user_card`

The minimal public view of a person (name, colour, school).

## `_valid_invite`

An invite that exists, isn't revoked or expired and has uses left, or 404 `invite_invalid`.

## `accept_invite`

`POST /api/v1/invites/{code}/accept`: become friends with the inviter (counts one use).

## `answer_request`

`POST /api/v1/friends/requests/{id}/{accept|decline|cancel}`: only the receiver can accept or decline, only the sender can cancel.

## `blocks`, `block`, `unblock`

`GET/POST /api/v1/blocks`, `DELETE /api/v1/blocks/{id}`: blocking ends the friendship and cancels requests both ways
(`friends.block`, also used by "Meld dit bericht" in chat).

## `classmates`

`GET /api/v1/classmates`: people who follow one of your classes, aren't your friends yet and aren't guests, without anyone blocked either way. Onboarding and 'Add friends' show them.

## `compare`

`GET /api/v1/compare?ids=&day=`: you and up to 3 friends (402 `compare_limit` for more; Premium later). Returns each person's free and busy blocks and every group that shares a break (`logic.compare_matches`). Hidden friends are listed in `missing`.

## `friend_schedule`

`GET /api/v1/friends/{id}/schedule`: a friend's lessons for up to 28 days, full, without rooms, or free/busy only (`schedule.busy_only`), or nothing while they're hidden. Far weeks are fetched on demand (`loading`, see `schedule.ensure_weeks`). Classes they skip are left out: you see free time, never that they skipped. Lessons from their calendar links lose their `origin` (`ics:<id>` is theirs alone); a school's (`untis:<id>`) stays, so a friend at your school is shown with your layout of the details (`mobile/src/lib/details.ts`).

## `invite_preview`

`GET /api/v1/invites/{code}`: who invited you, and whether you're already friends. Allowed for guests.

## `list_friends`

`GET /api/v1/friends`: your friends with what each shows you, what you show them and whether you pinned them;
pinned first, then by name (`friends.visible_friends`).

## `remove_friend`

`DELETE /api/v1/friends/{id}`: removes both directions.

## `send_request`

`POST /api/v1/friends/requests`: ask someone **from your school** (404 for anyone else, guests included). If they already asked you, you become friends at once. Blocked or already friends: the same answer as success. 30 per hour.

## `photo`

`GET /api/v1/users/{id}/photo`: someone's profile photo for whoever may see it (`friends.may_see_photo`), else 404.
Cached for good (`immutable`): the app asks with `?v=<photo_v>`, a new photo is a new URL.
