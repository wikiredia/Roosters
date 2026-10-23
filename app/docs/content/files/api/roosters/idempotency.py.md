---
updated: 2026-10-23T17:30:00Z
---

**Idempotency-Key** for writes. On bad school wifi a request often arrives but its answer gets lost, and
the app retries. With the same key, the retry gets the **stored answer** instead of running again. That
matters for anything that isn't naturally repeatable.

The app sends a new random key per action and the same key on a retry (`mobile/src/lib/api.ts`). Only for
signed-in users; keys are kept for 2 days. A 5xx answer isn't stored, so a retry runs for real.

## `IdempotencyMiddleware`

Replays a stored answer (header `Idempotent-Replayed: true`). Answers 409 `idempotency_busy` while the first request is still running, and 422 `idempotency_mismatch` when the key is reused for another path.

## `KEY_RE`, `WRITES`

Accepted key format (8-64 URL-safe characters) and the methods it applies to.

## `_reserve`

Insert the key, or return the existing row (we lost the race: someone already ran it).

## `_store`

Store the finished answer, or forget the key after a server error.

## `cleanup`

Deletes keys older than 2 days (hourly cleanup job).
