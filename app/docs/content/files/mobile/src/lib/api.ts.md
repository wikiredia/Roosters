---
updated: 2026-10-24T18:00:00Z
---

**Talking to the Roosters+ API on bad school wifi.** Every request goes through `api.get/post/put/patch/del`.

- Every request has a **timeout** (8 s for reads, 15 s for writes; fetch has none by default).
- **Safe retries** with backoff and jitter (3 attempts). Writes carry an **Idempotency-Key** that stays the
  same for every retry, so the server runs a write once (`api/roosters/idempotency.py`).
- **ETags**: GETs send `X-If-None-Match` (our own header), and on `X-Not-Modified: 1` we reuse our copy. Never
  a real 304 and `cache: 'no-store'`: iOS answers a 304 with its own cached copy, which was an old 401 (the
  `auth_expired` loop). After a 401 that a refresh fixed, the copy is dropped and the whole answer asked again.
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

## `refreshTokens`, `Refresh`

Swap the refresh token for a new pair, one at a time (shared by every request that needs it). `ok`, `offline`
(no network or a 5xx after three tries: the tokens stay) or `ended` (the refresh itself got a 401: the session
is gone, `clearSession` with the server's `reason`). Tokens that changed while it was underway (you signed in
again) win over its answer, and its failure then signs nobody out.

## `request`

The retry loop around `once`. Refreshes first when the access token runs out within a minute
(`session.accessExpiresSoon`), so requests don't hit a 401 at all. A 401 anyway: when new tokens arrived
meanwhile it simply asks again, else it refreshes and asks again (twice at most; the 401 is marked recovered in
the debug log). A refresh that couldn't reach the server makes it a network error, never a sign-out; network errors, 5xx and `idempotency_busy` retry with backoff.

## `setApiLanguage`

Sets the `Accept-Language` sent with every request (the server translates errors).

## `sleep`, `backoff`

Exponential backoff: 0.6 s, 1.2 s, … up to 8 s, plus up to 0.4 s of jitter.
