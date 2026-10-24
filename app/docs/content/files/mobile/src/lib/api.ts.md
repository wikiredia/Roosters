---
updated: 2026-10-24T14:00:00Z
---

**Talking to the Roosters+ API on bad school wifi.** Every request goes through `api.get/post/put/patch/del`.

- Every request has a **timeout** (8 s for reads, 15 s for writes; fetch has none by default).
- **Safe retries** with backoff and jitter (3 attempts). Writes carry an **Idempotency-Key** that stays the
  same for every retry, so the server runs a write once (`api/roosters/idempotency.py`).
- **ETags**: GETs send `If-None-Match`, and on a 304 we reuse the cached answer.
- **School wifi login pages** (HTML instead of JSON) are recognised and reported as `captive`, not shown as errors.
- An expired access token is **refreshed once** (one refresh at a time, shared by all requests). Only a
  real 401 from the server ends the session; no network keeps the tokens for later.
- Every attempt goes into a short log for the debug screen (`debuglog.ts`).

## `ApiError`

The server said no: HTTP status, the stable `code` (branch on this), the translated `message` (show this), and extra fields.

## `NetworkError`

No answer from our server: offline, timeout, or captive (a wifi login page or another program answering).

## `Options`

Per request: body, `auth` (false = don't send the token), timeout, `etag`, language.

## `api`

The helpers screens use (`api.get` uses ETags by default). Most screens use the hooks in `api/hooks.ts` instead.

## `once`

One attempt: headers, timeout, the ETag cache, recognising HTML answers, errors → ApiError/NetworkError, logging.

## `refreshTokens`

Swap the refresh token for a new pair, shared by concurrent requests.

## `request`

The retry loop around `once`: a 401 refreshes and retries once (marking the 401 in the debug log as recovered); network errors, 5xx and `idempotency_busy` retry with backoff.

## `setApiLanguage`

Sets the `Accept-Language` sent with every request (the server translates errors).

## `sleep`, `backoff`

Exponential backoff: 0.6 s, 1.2 s, … up to 8 s, plus up to 0.4 s of jitter.
