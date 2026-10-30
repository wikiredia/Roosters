---
updated: 2026-10-30T13:30:00Z
---

**Access requests** ("Mag ik je rooster zien?"): you ask a friend to show you more of *their* timetable (`full`, or
`norooms`: everything but the rooms). What you show others stays your own setting (`r_friends.edit_friend`); this
only asks. They accept (their `friendships.visibility` toward you becomes what you asked) or decline; you can
cancel while it's open. Routes in `r_friends.py` (`ask_access`, `answer_access`); table `access_requests`
(`migrations/0016_request_cards.sql`). The app side: `useAskAccess` / `useAnswerAccess` in
`mobile/src/api/hooks.ts` and the card in the chat.

Rules:
- Only between **friends** (not across a block). Unfriending or blocking cancels open ones (`friends.disconnect`),
  and the cards show nothing while you're not friends (`cards`).
- A **card in your direct chat** with them (`chat.post_request`), live: `cards` is what it shows.
- Notifications with a push: `access_request` to the friend, `access_answer` (accepted/declined) back to you; the
  payload's `chat` makes the push open the chat. Category `requests` in Meldingen (`push.CATEGORY`).

Tests: `tests/test_access.py`.

## `LEVELS`, `has_enough`

What a friend can show you, from little to much; `has_enough`: they already show you that much or more
(→ 400 `access_has`).

## `ask`

Checks and stores a request inside the caller's transaction, posts its card and notifies the friend.
→ `(request id, chat id)`. 404 `not_friends`, 400 `access_has`, 409 `access_dup` (one of yours to them is open).

## `answer`

accept / decline by the one asked, cancel by the one who asked, only while pending and still friends (else 404
`not_found`). Accept updates the friend's visibility toward the asker; accept and decline notify the asker.

## `cards`, `one`, `open_ids`

`cards`: per id the request as `uid` sees it (`{type: 'access', id, from, to, mine, visibility, status,
created_at}`), or None when it isn't theirs or they're not friends now (`chat.with_requests`). `one`: one of them
(the routes' answer). `open_ids`: pending ones from or to you, between friends (the chat list's `requests`).

## `export`, `delete_user`

The data export (`r_me.export`, `access_requests`) and account deletion (`accounts.delete_user`): from or to them.

## `_SELECT`, `_out`, `_person`

The query with both people's names, and a row as the app gets it.
