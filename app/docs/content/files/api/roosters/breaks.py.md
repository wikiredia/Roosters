---
updated: 2026-10-24T10:30:00Z
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
- Every step leaves an in-app notification (`break_request`, `break_answer`, `break_counter`, `break_cancelled`);
  sending them as push is the next step on the list (`app/README.md`).
- A **yes** also shows up in every chat the two share (`chat.post_event`, type `break_planned`): "Lotte en Amir
  pakken samen pauze om 12:30".

Tests: `tests/test_breaks.py`.

## `conflict`, `summarize`, `flip`, `already_asked`

The pure parts. `conflict` → `no_classes` / `home` / `in_class` or None; `summarize` → planned (someone said yes),
declined (everyone said no) or pending; `flip` turns their "I come to you" into my "you come to me" for a
counter-proposal; `already_asked` finds a running request with the same people at the same time ('mine' or 'theirs').

## `MAX_DAYS_AHEAD`, `MIN_MINUTES`, `MODES`

How far ahead you can ask, the shortest break, the three ways to meet.

## `create`

Checks everything above and stores the request inside the caller's transaction; notifies the people asked. With
`counter_of` the clash check ignores the request being answered.

## `respond`, `counter`, `cancel`

Yes/no from someone asked (a yes can still become a no, until the break is over: `break_over`; a yes posts the
event in their shared chats); another time (a no
to this one and `create` back to the asker, who-walks flipped, same place unless a new one is given); taking your own
request back (only the asker; `break_gone` for anyone else, the same as a request that doesn't exist).

## `list_for`

Requests from and to you that aren't over yet (today and the coming two weeks, or one day), in time order, with
everyone's answer, your own (`my_response`), the state and whether it's happening `now`. Also in `GET /me/today`.

## `delete_user`

Account deletion (`accounts.delete_user`): their requests and their answers go too.

## `check_day`, `check_time`, `_now`, `_members`, `_existing`, `_load`, `_over`, `_person`

Helpers: the allowed days and times (`break_day`, `break_time`), now in the school's timezone, everyone asked per
request, requests on a day for the clash check, a request locked for an update (`break_gone` when cancelled), and the
small person card in answers.
