---
updated: 2026-10-23T17:30:00Z
---

**Signing in**, with no passwords: a 6-digit code by e-mail, Sign in with Apple, Sign in with Google, or
**not signing in yet** (a guest account).

Flow (e-mail): `POST /email/start` queues a mail job with a code (only its keyed hash is stored) →
the user types the code → `POST /email/verify` → session tokens (`tokens.start_session`).

**Guests and upgrades:** `POST /guest` creates an account with no sign-in method (`users.is_guest=1`).
When a request to `/email/verify`, `/apple` or `/google` carries a **guest's bearer token**:
- no account exists for that identity yet → the guest account **becomes** the account (keeps school,
  timetable and settings; `is_guest` is cleared and its old session is revoked);
- an account exists → that account wins and the guest is folded into it (`accounts.fold_guest`).
A signed-in non-guest who signs in again is never merged.

The app side: `mobile/src/lib/onboarding.ts` (sends the guest token along, after freshening it).
Tests: `tests/test_auth.py`, `tests/test_guests.py`.

## `Device`, `EmailStart`, `EmailVerify`, `AppleLogin`, `GoogleLogin`, `RefreshIn`

Request bodies. `Device` (device_name, platform) is stored with the session and shown in 'your sessions' and in the console.

## `EMAIL_RE`, `_email`

A loose e-mail check (something@something.tld); addresses are lower-cased and trimmed. 400 `email_invalid` otherwise.

## `_answer`

Starts a session and adds `is_new` (the app shows onboarding for new accounts).

## `_client_ip`

The caller's IP: the first `X-Forwarded-For` hop (our own proxy sets it) or the socket address.

## `_existing`

Signing in to an account that exists: refused when it was turned off (403 `account_disabled`); folds the guest in when there is one.

## `_guest_id`

The guest account to upgrade: only when the request carries a valid token of a **guest** (`deps.optional_auth`).

## `_new_user`

Inserts a user. The name defaults to the part before @ (or 'Student'), with a random avatar colour of 8.

## `_provider_login`

Shared by Apple and Google: sign in in a transaction, retrying once on a duplicate-key error (two simultaneous first sign-ins after a double tap on slow wifi).

## `_sign_in`

Finds or creates the account for an identity (provider + subject). Order:
1. the identity is known → its account;
2. the e-mail is **verified** and an account has it → that account (links Apple/Google/e-mail);
3. a guest is signing in → the guest becomes the account. A guest who never picked a name gets one the way a new account would (Apple's name, or the part of the address before @);
4. otherwise a new account.
An unverified e-mail never links to an existing account (`test_unverified_email_does_not_take_over_an_account`).

## `apple`, `google`

`POST /api/v1/auth/apple` and `/google`: verify the ID token (`providers.py`), then `_provider_login`. Apple sends the user's name only the first time, from the app, so it comes in the body.

## `email_start`

`POST /api/v1/auth/email/start`: always 204, also for unknown addresses (nobody can find out who has an account). Rate-limited per IP and per address; older unused codes for the address stop working. The mail goes out from a job (`mailer._job_send_code`).

## `email_verify`

`POST /api/v1/auth/email/verify`: checks the newest unused code (constant-time compare). A wrong code counts an attempt; after 5 the code is dead (`code_attempts`). On success the code is used up and the user is signed in (or the guest upgraded).

## `guest`

`POST /api/v1/auth/guest`: a guest account and a session. 60 per 10 minutes per IP (a whole school shares one IP). Abandoned guests are removed by the worker (`worker._cleanup`).

## `logout`, `logout_all`

End this session, or every session of the account.

## `refresh`

`POST /api/v1/auth/refresh`: a new token pair for a refresh token (`tokens.refresh`).

## `sessions`

`GET /api/v1/auth/sessions`: your signed-in devices, the current one marked.
