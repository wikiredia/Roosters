---
updated: 2026-10-24T16:00:00Z
---

**Sessions**: a short-lived access token (a JWT, 15 minutes) and a long-lived refresh token that
**rotates** on every use. The app keeps both in the phone's secure storage (`mobile/src/lib/session.ts`)
and sends `Authorization: Bearer <access>`. Only hashes of refresh tokens are stored.

**Lost answers:** a refresh whose answer never reached the phone (bad wifi, the app closed or reloaded halfway)
is retried with the *previous* token. Every rotation counts up `sessions.gen`, every access token carries its
`gen`, and `seen_gen` remembers the newest generation the phone has used (`saw`, from `deps.auth`). The previous
token is accepted as long as the newer pair was **never used**, and always within `REUSE_GRACE` (2 minutes).
Only the previous token showing up *after* the phone already used the newer pair means a copy is in someone
else's hands: then the whole session is revoked (`reason: reuse`). Before generations, a lost answer older
than 2 minutes ended the session, which showed up in the app as `auth_expired` loops.

**Why a session ended** is stored (`revoked_reason`) and sent along as `reason` in the 401 of a refresh
(`logout`, `logout_all`, `reuse`, `guest_signed_in`, `disabled`, `admin`, `expired`, `unknown_token`).

## `ALG`, `_key`

HS256 with a key derived from SECRET_KEY for this purpose only.

## `REUSE_GRACE`

How long the previous refresh token is always accepted after a rotation, even once the newer pair was used
(two refreshes crossing on bad wifi).

## `_bundle`

The token answer the app stores.

## `_refresh_hash`

Keyed hash of a refresh token (`crypto.keyed_hash`).

## `access_token`, `decode_access`

Make and check an access token: `sub` = user id, `sid` = session id, `gen` = refresh generation, `typ` = access.
`decode_access` returns `(user, session, gen)` (gen `None` for tokens from before generations) and raises 401
`auth_expired` or `auth_required`.

## `refresh`

Swap a refresh token for a new pair: rotate the hash, remember the previous one, count up `gen`, extend the
expiry. Using the current token proves the phone has that generation (`seen_gen`). Handles the lost-answer and
stolen cases above; an ended session answers 401 `auth_expired` with its `reason`.

## `revoke`, `revoke_all`

Sign out one session, or every session of a user, with a reason (`revoked_reason`). Takes effect immediately
(`deps.auth` checks sessions). Every revoke goes through these (`r_auth`, `admin`).

## `saw`

A request with an access token of the session's newest generation: the phone has the newest pair, so from now
on the previous refresh token is no longer a lost-answer retry. One write per rotation, not per request.

## `start_session`

A new session row (device name, platform, expiry) and its first token pair.

## `user_from_header`

The user id from a valid header, **without** checking the session in the database. Only for the idempotency middleware, which runs before routing; real authorisation is `deps.auth`.
