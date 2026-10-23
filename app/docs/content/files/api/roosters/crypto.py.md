---
updated: 2026-10-23T17:30:00Z
---

All cryptography is derived from **one secret**, `config.SECRET_KEY`:

- `derived_key(purpose)`: a separate key per purpose (access tokens, refresh-token hashes, login-code
  hashes, e-mail hashes) via HMAC, so one leaked derived key doesn't expose the others.
- `encrypt`/`decrypt`: Fernet (AES + HMAC) for **personal calendar links** (`sources.secret_enc`).
  These URLs are secret: whoever has one can read that calendar.

Changing `SECRET_KEY` signs everyone out and makes stored calendar links unreadable (`sync.sync_source`
then reports 'could not be decrypted').

## `_fernet`

The Fernet key: SHA-256 of `roosters-enc:` + SECRET_KEY. Refuses to run without a 32+ character secret.

## `derived_key`

HMAC(SECRET_KEY, 'roosters+:' + purpose).

## `encrypt`, `decrypt`

Calendar links in and out of the database. `decrypt` returns None for an empty value or one encrypted with another key, instead of raising.

## `keyed_hash`

HMAC with a derived key, used instead of a bare hash for login codes, e-mail addresses in `login_codes` and refresh tokens. A leaked database can't be brute-forced without SECRET_KEY, which matters for 6-digit codes.

## `same`

Constant-time comparison (tokens, code hashes), so timing doesn't leak how much matched.

## `sha`

Plain SHA-256 hex, for non-secret fingerprints.

## `token`

A random URL-safe token (refresh tokens, 32 bytes).
