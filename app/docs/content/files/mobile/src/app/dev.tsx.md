---
updated: 2026-10-24T07:47:21Z
---

**Test data & users** (Me → Test data & users): only in development builds (or with `EXPO_PUBLIC_DEBUG=1`), against an
API with ENV=dev, from this computer or your own network (`api/roosters/r_debug.py`). Developer-facing, so English and
not translated, like `debug.tsx`.

- **You**: who you are now; 'Give me a test timetable' (a 'Testrooster' source, removable under Timetable sources).
- **Test data**: 1 or 3 test friends, a test person who isn't your friend ('stranger'), remove all test people.
- **Switch user**: every account, with tags (test, guest, not onboarded, what they see of you and what they show
  you). Tap one to continue as them: a new session (`/debug/login`), the query cache is dropped and the app starts
  over on Today. Befriend / unfriend and remove a test person right in the list.

To test privacy: change what a friend sees on their page (Me → Friends → name: everything, without rooms, free/busy),
switch to them and open your own page.

## `DevScreen`, `DevUser`

The screen and one account as `GET /api/v1/debug/users` returns it.

## `errorText`, `VIS`

What went wrong in words (a 404 means: no ENV=dev, an older API, or not on your own network); the visibility labels.
