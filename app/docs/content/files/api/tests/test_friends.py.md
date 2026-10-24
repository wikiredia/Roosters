---
updated: 2026-10-24T13:40:00Z
---

Friends end to end: invite links work both ways, shared breaks and the now-board, free/busy hiding what
and where, ghost mode, strangers seeing nothing, silent blocking, requests within a school, the Compare
limit, ETags on Today, account deletion removing everything, a retried write (Idempotency-Key) running
once, classes needing a school, the classmates list, and pinned friends.

## `_friend_ids`, `test_pinned_friends_come_first_and_stay_private`, `test_a_pin_goes_with_the_friendship`

Pinned friends: first in `GET /friends` and on Today's board (even without classes), only on your side (the friend
sees nothing), set together with or apart from the visibility, 404 for someone who isn't a friend; in the export;
gone after unfriending, a block and deleting the account (friends again: unpinned). `_friend_ids`: your friends as
`(id, pinned)` in the API's order.

## `DAY`, `_setup`

A fixed school day and two or three onboarded friends with lessons. A week of the timetable comes with the shared breaks per day (`together=1`).
