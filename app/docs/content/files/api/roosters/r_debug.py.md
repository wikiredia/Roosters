---
updated: 2026-10-24T09:54:20Z
---

Troubleshooting and test endpoints for the laptop and the test server. They answer **404 unless ENV=dev**
(`dev_only`), so they can't leak mail setup on a real server. The app's debug screen
(`mobile/src/app/debug.tsx`) calls the mail checks; **Test data & users** (`mobile/src/app/dev.tsx`) the rest.

Test data and switching need a normal sign-in (`deps.auth`), from any network, and only ever touch **your own
account and the test people it made** (`users.test_owner_id`, `_yours`): another real account, or someone else's
test people, is a 404 as if it didn't exist. Test people and their timetables: `testdata.py`.

## `TestMailIn`, `test_mail`

`POST /api/v1/debug/mail`: send a test mail right away (10 per hour per IP).

## `dev_only`

Dependency: 404 outside ENV=dev.

## `_yours`, `_one_of_yours`

Your real account (yourself, or the owner of the test person you're switched to) and its test people; one of them
or a 404.

## `users`

`GET /api/v1/debug/users`: your account and your test people with test/guest flags, and whether they're friends with
whoever you are now (what you show each other). `me`: who you are now; `owner`: your real account.

## `LoginAsIn`, `login_as`

`POST /api/v1/debug/login {user_id, platform?, device_name?}`: switch to one of your test people or back to your
account. Goes through the real sign-in code (`r_auth._sign_in` with the account's sign-in identity, so a turned-off
account is refused, then `_answer`: a new session for this device) and signs this session out, like signing out
and in again. The answer is a sign-in's.

## `TestUsersIn`, `add_test_users`, `remove_test_users`, `remove_user`

`POST /api/v1/debug/test-users {count, befriend}` (needs you signed in: they get your school, campus and friendship),
`DELETE /api/v1/debug/test-users` (all of yours), `DELETE /api/v1/debug/users/{id}` (one of your test people;
anything else 404).

## `give_timetable`

`POST /api/v1/debug/users/{id}/timetable`: a test timetable for your account or one of your test people.

## `FriendIn`, `set_friend`

`PUT /api/v1/debug/friends/{id} {friends}`: friends right away with your account or one of your test people, or
not any more.

## `diagnose`

`GET /api/v1/debug`: `debug.diagnose()`.

## `add_test_chats`

`POST /api/v1/debug/test-chats` → 201 `{chats: [group, direct]}`: a group 'De bende' with you and your test friends
and a one-to-one chat with one of them, with a few of their messages (`testdata.give_chats`). 400 `chat_people`
without test friends.
