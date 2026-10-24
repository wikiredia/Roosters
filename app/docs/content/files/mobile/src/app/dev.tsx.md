---
updated: 2026-10-24T09:55:20Z
---

**Test data & users** (Me → Test data & users): only in development builds (or with `EXPO_PUBLIC_DEBUG=1`), against an
API with ENV=dev, signed in like any screen (`api/roosters/r_debug.py`). Only your own account and the test people
it made are listed: never another real account. Developer-facing, so English and
not translated, like `debug.tsx`.

- **You**: who you are now; 'Give me a test timetable' (a 'Testrooster' source, removable under Timetable sources).
- **Test data**: 1 or 3 test friends, a test person who isn't your friend ('stranger'), test chats with your test
  friends (a group and a one-to-one chat with a few messages), remove all test people.
- **Switch user**: your account ('your account') and your test people, with tags (test, guest, not onboarded, what
  they see of you and what they show you). Tap one to continue as them, and tap your account to go back: the real
  sign-in code runs (`/debug/login`, this session signs out, a new one for this device), the query cache is dropped
  and the app starts over on Today. Befriend / unfriend and remove a test person right in the list.

To test privacy: change what a friend sees on their page (Me → Friends → name: everything, without rooms, free/busy),
switch to them and open your own page.

## `DevScreen`, `DevUser`

The screen and one account as `GET /api/v1/debug/users` returns it.

## `errorText`, `VIS`

What went wrong in words (a 404 means: no ENV=dev, an older API, or not your account); the visibility labels.
