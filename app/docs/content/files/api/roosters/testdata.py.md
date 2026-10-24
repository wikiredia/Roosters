---
updated: 2026-10-24T07:47:21Z
---

**Test people** for trying the app on a laptop or test server: made-up friends with a made-up timetable, so you can
switch to them (`r_debug.login_as`) and see what a friend sees. Only reachable through `r_debug.py` (ENV=dev, private
network). The app side is `mobile/src/app/dev.tsx` (Me → Test data & users).

- Test people are recognised by their e-mail domain (`TEST_DOMAIN`, `roosters.test`): removing them removes
  everything they have (`accounts.delete_user`).
- Their timetable is a personal calendar source **without a link** (label 'Testrooster', `config.test`), filled with
  lessons from last week to three weeks ahead. `last_sync` is set far in the future (`NEVER`), so `sync` never tries
  to fetch it (it would fail: there's no link).
- Lessons are seeded per person and day: the same every time, different between people, so shared breaks appear
  and disappear like with real timetables.

Tests: `tests/test_testdata.py`.

## `create`

`count` test people at your school and campus, onboarded, each with a test timetable, friends with you unless
`befriend` is off. Names from `NAMES`, then 'Test n'.

## `give_timetable`

(Re)places the test timetable of anyone (a test person, or your own account): one source 'Testrooster'. Real sources
are kept.

## `lessons_for`

The made-up lessons: 2–4 a school day at `SLOTS`, 1–2 hours, never overlapping, sometimes cancelled.

## `remove_all`, `is_test`

Remove every test person; is this account a test person?

## `TEST_DOMAIN`, `NAMES`, `COURSES`, `ROOMS`, `SLOTS`, `NEVER`

The e-mail domain of test people, their names, the courses (with kind), rooms and start times, and the `last_sync`
that keeps sync away.
