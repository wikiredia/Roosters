---
updated: 2026-10-30T15:07:00Z
---

**Break requests** ("Pauze samen?"): you tap a break you share with friends and ask them to spend it together:
I come to you (`i_come`), you come to me (`you_come`) or meet at a place (`meet`), from–until (by default the whole
break), with a short note. Each person asked answers yes or no, or proposes **another time** (a new request the
other way, `counter_of` points at the one it answers). The one who asked can take it back. Routes in `r_breaks.py`;
the app side is `mobile/src/components/BreakSheet.tsx` and the 'Pauzeverzoeken' section on Today.

Rules (keep them when you change anything here):
- Only **friends** who can see you and aren't hidden (ghost mode): `friends.visible_friends_of`; the list only shows
  requests with people who are still your friends, so unfriending or blocking makes them disappear.
- **Everyone must be free** then (`conflict`): no lesson in the way, at school that day, not gone home. Before the
  first or after the last lesson is fine. The error names who can't and why (codes, not text: a free/busy friend
  only reveals that they're busy, which they show anyway).
- **No asking twice** (`already_asked`): the same people at (part of) the same time, from either side, is a 409
  `break_dup` with the request it clashes with. A no doesn't count any more.
- Today and the next two weeks (`MAX_DAYS_AHEAD`); at least 5 minutes, not already over (school's timezone).
- Someone who said **"Ik ben bezig"** for today's breaks (checkin `break_status` 'busy') can't be asked during a
  break between their classes (`conflict` → `busy`; after school still works).
- Every request is a **card in the chat** (`chat.post_request`, kind 'request'): in the direct chat with each person
  asked, or once in the group whose members are exactly the asker and them. `create` returns the chats, so
  `POST /breaks` and the counter can answer with `chats` (the app opens that chat).
- Every step leaves an in-app notification with a push (`break_request`, `break_answer`, `break_counter`,
  `break_cancelled`); the payload's `chat` is the chat with the card for whoever gets it (`chat.card_chats`), so
  the push opens it.
- A **yes** also shows up in the other chats the two share (`chat.post_event`, type `break_planned`): "Lotte en Amir
  pakken samen pauze om 12:30"; not in the chats with the card (it shows the yes already).
- A card says whether the break **can still happen** (`feasibility`: `possible`, `blocked`), the one-to-one chat
  has the breaks you share **this school week** (`shared_with`), and the Rooster tab's coffee zone lists who you
  **usually** go with (`usual`).

Tests: `tests/test_breaks.py`.

## `conflict`, `summarize`, `flip`, `already_asked`

The pure parts. `conflict` → `no_classes` / `home` / `in_class` / `busy` or None; `summarize` → planned (someone said yes),
declined (everyone said no) or pending; `flip` turns their "I come to you" into my "you come to me" for a
counter-proposal; `already_asked` finds a running request with the same people at the same time ('mine' or 'theirs').

## `MAX_DAYS_AHEAD`, `MIN_MINUTES`, `MODES`

How far ahead you can ask, the shortest break, the three ways to meet.

## `school_change`, `school_week`, `SCHOOL_CHANGES`

Pure parts. `school_change`: the lessons in the way between start and end that take place, mapped by state
(`SCHOOL_CHANGES`: Untis' `extra` → `new_lesson`, `changed` → `moved`); `new_lesson` wins; None when nothing is in
the way or when one of them is a normal lesson (a skip undone is the person's own doing, so no reason).
`school_week`: today to Friday, on Saturday/Sunday the coming Monday to Friday.

## `feasibility`

Adds `possible` / `blocked` to break requests as `_out` gives them; called by `cards` only (the chat), not by
`list_for`. Only for requests still on (not over, state pending or planned); the rest stay `possible: true,
blocked: null`. Checks the asker and everyone asked who didn't say no (all of them, also people the viewer can't
see) with `conflict` on that day (`schedule.person_days` + `logic.day_info`), one batch per day. `blocked` is set
only when every conflict is `in_class` and every one of those people's lessons in the way is a school change
(`school_change`, with `schedule.lessons` for the states); a skip undone, home, busy, absent → null. Part of the
messages body, so the ETag changes with it. The app: `mobile/src/components/chat/RequestCard.tsx` ("Niet meer
mogelijk").

## `shared_with`

`GET /chats/{id}` of a one-to-one chat (`chat.chat_out` with the user): the breaks you share with that friend from
now (today after the current minute) to the end of the school week (`school_week`), with `logic.partners` like
`r_me.together_days`. Nothing when you're not friends or they're hidden (ghost); blocking ends the friendship.
`asked`: a request between you two (either way, any answer, not cancelled) overlapping that break. One
`person_days` per day (at most 5). The app shows the first one not asked as the "Pauze samen?" suggestion.

## `usual`, `USUAL_WEEKS`, `USUAL_MAX`, `USUAL_MIN`

`GET /breaks/usual` ("Meestal ga je met:"): per friend, how many planned breaks you had together in the last 8
weeks up to today (a request between you two, either way, not cancelled, where the one asked said yes; in a group
request, only asker ↔ the one who said yes counts). Up to 6, most first, ties in friends-list order (pinned, then
name). Fewer than 3: filled up to 3 with your pinned friends (count 0). Hidden (ghost) friends are left out.

## `create`

Checks everything above and stores the request inside the caller's transaction; posts its card in the chat and
notifies the people asked (with the chat of their card). With `counter_of` the clash check ignores the request
being answered. → `(request id, [chat ids])`; `counter` returns the same.

## `respond`, `counter`, `cancel`

Yes/no from someone asked (a yes can still become a no, until the break is over: `break_over`; a yes posts the
event in their shared chats); another time (a no
to this one and `create` back to the asker, who-walks flipped, same place unless a new one is given); taking your own
request back (only the asker; `break_gone` for anyone else, the same as a request that doesn't exist).

## `list_for`

Requests from and to you that aren't over yet and not cancelled (today and the coming two weeks, or one day), in
time order, with everyone's answer, your own (`my_response`), the state and whether it's happening `now`. Also in
`GET /me/today` and for the chat list's `requests` count.

## `cards`

What the request cards in the chat show (`chat.with_requests`): the same shape as `list_for` plus `type: 'break'`,
for any day, with `over` and state `cancelled` when taken back, and `possible` / `blocked` (`feasibility`). None when it isn't for you (any more): not the
asker or someone asked, or not friends now.

## `_SELECT`, `_out`

The query both read from, and turning rows into what one user sees (only people who are still your friends;
`over` from the school's clock).

## `delete_user`

Account deletion (`accounts.delete_user`): their requests and their answers go too.

## `check_day`, `check_time`, `_now`, `_members`, `_existing`, `_load`, `_over`, `_person`

Helpers: the allowed days and times (`break_day`, `break_time`), now in the school's timezone, everyone asked per
request, requests on a day for the clash check, a request locked for an update (`break_gone` when cancelled), and the
small person card in answers.
