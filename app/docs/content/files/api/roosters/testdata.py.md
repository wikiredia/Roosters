---
updated: 2026-10-24T09:54:20Z
---

**Test people** for trying the app on a laptop or test server: made-up friends with a made-up timetable, so you can
switch to them (`r_debug.login_as`) and see what a friend sees. Only reachable through `r_debug.py` (ENV=dev, private
network). The app side is `mobile/src/app/dev.tsx` (Me → Test data & users).

- Test people are recognised by their e-mail domain (`TEST_DOMAIN`, `roosters.test`) and **belong to the account
  that made them** (`users.test_owner_id`): only it sees them, switches to them and removes them; deleting that
  account deletes them too. Each has an e-mail sign-in identity, so switching to one runs the real sign-in code.
  Removing them removes everything they have (`accounts.delete_user`).
- Their timetable is a personal calendar source **without a link** (label 'Testrooster', `config.test`), filled with
  lessons from last week to three weeks ahead. `last_sync` is set far in the future (`NEVER`), so `sync` never tries
  to fetch it (it would fail: there's no link).
- Lessons are seeded per person and day: the same every time, different between people, so shared breaks appear
  and disappear like with real timetables.

- Test chats (`give_chats`): a group with your test friends and a one-to-one chat, with a few of their messages, so
  the chat screens have something to show. Switch to a test person to answer.

Tests: `tests/test_testdata.py`.

## `create`

`count` test people at your school and campus, onboarded, each with a test timetable, friends with you unless
`befriend` is off. Names from `NAMES`, then 'Test n'.

## `give_timetable`

(Re)places the test timetable of anyone (a test person, or your own account): one source 'Testrooster'. Real sources
are kept.

## `lessons_for`

The made-up lessons: 2–4 a school day at `SLOTS`, 1–2 hours, never overlapping, sometimes cancelled.

## `remove_all`, `mine`, `owner_of`, `is_test`

Remove an account's test people; the ids of its test people; the real account behind whoever is signed in
(yourself, or the owner of the test person you switched to); is this account a test person (by e-mail domain)?

## `TEST_DOMAIN`, `NAMES`, `COURSES`, `ROOMS`, `SLOTS`, `NEVER`

The e-mail domain of test people, their names, the courses (with kind), rooms and start times, and the `last_sync`
that keeps sync away.

## `give_chats`, `LINES`

A group 'De bende' with you and up to 5 test friends (3 of them say something) and a one-to-one chat with the first
(2 messages), all unread for you. What they say comes from `LINES`.
