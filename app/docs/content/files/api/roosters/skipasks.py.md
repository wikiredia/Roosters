---
updated: 2026-10-30T15:40:00Z
---

**Skip questions** ("Volg je Python?"): in Vergelijken you drag one of a friend's classes into the bin, which asks
them whether they'd skip it, because then you'd share a break (`minutes`, worked out when asking with the same rules
as the yellow blocks). It's the other way round from your own skips (`r_me.skip`): their timetable stays theirs.
Routes in `r_friends.py` (`ask_skip`, `list_skip_requests`, `answer_skip`); table `skip_requests`
(`migrations/0017_skip_requests.sql`). The app side: `useAskSkip`, `useSkipAsks`, `useAnswerSkip` in
`mobile/src/api/hooks.ts`, `components/timetable/CompareView.tsx` and the card in the chat.

Rules:
- While it's open **only the asker** sees the class as skipped (the app draws it from `list_for`); the one asked sees
  nothing change. A **yes** inserts `skipped_lessons` rows for them (one per course in the span), so both phones
  show the longer break; no or taken back changes nothing.
- The **course is theirs to tell**: the asker only gets it back (card, list) when the friend shows them courses
  (visibility `full` or `norooms`). The answer's notification never names it.
- Only between **friends** (not hidden, not across a block); unfriending hides the questions for both (`cards`,
  `list_for`, `open_ids` only show them between friends).
- A **card in your direct chat** (`chat.post_request`, payload `{type: 'skip', request}`) and notifications with a push:
  `skip_request` to the friend, `skip_answer` back to you (category `requests`, `push.skip_text`).

Tests: `tests/test_skipasks.py`.

## `ask`

Checks and stores a question inside the caller's transaction, posts its card and notifies the friend. 404
`not_friends` (or hidden), 400 `skip_day` (over), 404 `skip_unknown` (nothing of theirs takes place in the span),
400 `skip_ask_nothing` (even then no shared break), 409 `skip_ask_dup` (you already asked about that time).
→ `(request id, chat id)`.

## `answer`

accept / decline by the one asked, cancel by the asker; only while pending, not over and still friends (else 404).
Accept skips their classes in the span as if they dragged them into the bin themselves.

## `shared_minutes`

How long the two would share a break that day if the friend skipped what's in the span: `logic.pair_breaks` with
those lessons left out, the breaks touching the span added up.

## `cards`, `one`, `_out`, `_SELECT`, `_person`

What the cards show a user (`chat.with_requests`): the question as it is now, or None when it isn't theirs or the two
aren't friends any more. `_out` leaves the course out for an asker who may not see it.

## `list_for`, `open_ids`

Your open questions from today on (GET `/skip-requests`), and their ids for the chat list's "Verzoek" count.

## `_in_span`

The lessons that take place inside the span (a double period, or a merged free/busy block, as one).

## `export`, `delete_user`

In the data export of both; deleted with either account (`accounts.delete_user`).
