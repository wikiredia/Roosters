---
updated: 2026-10-24T07:47:21Z
---

Troubleshooting and test endpoints for the laptop and the test server. They answer **404 unless ENV=dev**
(`dev_only`), so they can't leak mail setup on a real server. The app's debug screen
(`mobile/src/app/debug.tsx`) calls the mail checks; **Test data & users** (`mobile/src/app/dev.tsx`) the rest.

Switching users and test data have a second lock (`local_only`): only from this computer or a private network,
every hop included. With ENV=dev anyone who reaches these routes can become anyone, so a server that runs with ENV=dev
by mistake still doesn't open them to the internet. Test people and their timetables: `testdata.py`.

## `TestMailIn`, `test_mail`

`POST /api/v1/debug/mail`: send a test mail right away (10 per hour per IP).

## `dev_only`

Dependency: 404 outside ENV=dev.

## `local_only`, `_private`

Dependency: `dev_only`, and the connection and every `X-Forwarded-For` address must be private or loopback.

## `users`

`GET /api/v1/debug/users`: every account (newest first, 200 at most) with test/guest flags, and for your friends
what you show them and what they show you.

## `LoginAsIn`, `login_as`

`POST /api/v1/debug/login {user_id}`: a new session for anyone, no code (the same answer as a sign-in).

## `TestUsersIn`, `add_test_users`, `remove_test_users`, `remove_user`

`POST /api/v1/debug/test-users {count, befriend}` (needs you signed in: they get your school, campus and friendship),
`DELETE /api/v1/debug/test-users` (all), `DELETE /api/v1/debug/users/{id}` (one test person; real accounts 404).

## `give_timetable`

`POST /api/v1/debug/users/{id}/timetable`: a test timetable for any account.

## `FriendIn`, `set_friend`

`PUT /api/v1/debug/friends/{id} {friends}`: friends right away, or not any more.

## `diagnose`

`GET /api/v1/debug`: `debug.diagnose()`.
