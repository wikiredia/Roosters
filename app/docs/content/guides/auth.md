---
title: Auth, sessions and guests
position: 20
updated: 2026-10-24T16:00:00Z
---

## Ways in

| How | Route | Notes |
| --- | --- | --- |
| E-mail code | `POST /api/v1/auth/email/start` → `/email/verify` | 6 digits, 10 minutes, 5 tries; only keyed hashes stored |
| Apple | `POST /api/v1/auth/apple` | ID token checked against Apple's keys, audience and nonce |
| Google | `POST /api/v1/auth/google` | ID token checked against Google's keys and audience |
| **Guest** | `POST /api/v1/auth/guest` | no sign-in method yet; straight into the app |

All of them end in `tokens.start_session`: a **15-minute access token** (a JWT) and a **refresh token** that
rotates on every use (180 days). The app keeps both in the phone's secure storage.

## Accounts and identities

One `users` row can have several `auth_identities` (e-mail, Apple, Google). A **verified** e-mail address
links them: signing in with Google using the same verified address as your e-mail login reaches the same
account. An unverified address never links (that would let anyone take over an account).

## Guests: skippable onboarding

A guest has `users.is_guest = 1` and no identity. Guests can do everything **with their own timetable**
(school, classes, calendar links, Today, Rooster), but **nothing social**. Every route in `r_friends.py`
uses `Depends(verified)` and answers 403 `verify_required`, and guests never show up for anyone else
(classmates, friend requests).

When a guest signs in, the app sends the guest's token along (`mobile/src/lib/onboarding.ts`):
- **new identity** → the guest account *becomes* the account (`r_auth._sign_in`): nothing is lost;
- **existing account** → that account wins, and the guest's school and timetable come along only where the
  account has none (`accounts.fold_guest`); then the guest is deleted.

Abandoned guests (no valid session, older than 7 days) are removed by the hourly cleanup (`worker._cleanup`).

## Sessions on bad wifi

- The refresh answer can get lost (bad wifi, the app closed or reloaded halfway): the previous refresh token
  stays valid as long as the phone never used the newer pair (refresh generations, `tokens.saw`), and always for
  2 minutes (`tokens.REUSE_GRACE`).
- Only the old token showing up after the newer pair was used means it was stolen: the session is revoked.
- The app refreshes a minute before the access token runs out, and only a 401 *from the refresh itself* signs it
  out (`mobile/src/lib/api.ts`); the server sends the reason along (`revoked_reason`).
- Every request checks the session in the database (`deps.auth`), so 'sign out everywhere', account
  deletion and turning an account off in the console all take effect at once.

## Turning accounts off

The console (Users → Turn off) sets `users.disabled_at` and revokes all sessions. `deps.auth` refuses
them, and signing in again answers 403 `account_disabled`.

Tests: `api/tests/test_auth.py`, `api/tests/test_guests.py`.
