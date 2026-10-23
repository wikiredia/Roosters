---
updated: 2026-10-23T17:30:00Z
---

**Sessions**: a short-lived access token (a JWT, 15 minutes) and a long-lived refresh token that
**rotates** on every use. The app keeps both in the phone's secure storage (`mobile/src/lib/session.ts`)
and sends `Authorization: Bearer <access>`. Only hashes of refresh tokens are stored.

**Bad wifi:** a refresh whose answer got lost is retried with the *previous* token. That's accepted for 2
minutes (`REUSE_GRACE`). Later than that it looks like a stolen token, and the whole session is revoked.

## `ALG`, `_key`

HS256 with a key derived from SECRET_KEY for this purpose only.

## `REUSE_GRACE`

How long the previous refresh token stays valid after rotation (a retry after a lost answer).

## `_bundle`

The token answer the app stores.

## `_refresh_hash`

Keyed hash of a refresh token (`crypto.keyed_hash`).

## `access_token`, `decode_access`

Make and check an access token: `sub` = user id, `sid` = session id, `typ` = access. `decode_access` raises 401 `auth_expired` or `auth_required`.

## `refresh`

Swap a refresh token for a new pair: rotate the hash, remember the previous one, extend the expiry. Handles the retry/stolen cases above.

## `revoke`, `revoke_all`

Sign out one session, or every session of a user. Takes effect immediately (`deps.auth` checks sessions).

## `start_session`

A new session row (device name, platform, expiry) and its first token pair.

## `user_from_header`

The user id from a valid header, **without** checking the session in the database. Only for the idempotency middleware, which runs before routing; real authorisation is `deps.auth`.
