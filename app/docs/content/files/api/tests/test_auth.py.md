---
updated: 2026-10-24T16:00:00Z
---

Sign-in and sessions: e-mail codes (one account per address, language of the mail, attempt limits, a
newer code replacing an older one, rate limits), refresh-token rotation with the grace period and
theft detection, a lost refresh answer never ending the session (generations), why an ended session ended, logout everywhere, forged and expired tokens, Apple with nonce, Google, wrong audience or
issuer, and **an unverified e-mail never taking over an account**. Apple/Google are faked with a local
RSA key (`idp`).

## `_code_from`, `idp`

Read the code from a captured mail; a fake identity provider (key set + signed ID tokens).
