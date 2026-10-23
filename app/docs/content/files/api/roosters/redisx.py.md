---
updated: 2026-10-23T17:30:00Z
---

Redis (**Valkey** in compose) for what's shared between API processes and workers: **rate limits**,
**locks**, the **Untis throttle**, and the worker heartbeat (`debug.py`). Nothing permanent lives in
Redis (persistence is off in compose): losing it costs nothing but a reset of the counters.

Rate limits **fail open**: when Redis is briefly unreachable the API keeps working instead of refusing
everyone.

## `_RELEASE`

Lua script: delete the lock only if we still own it (compare the token), so we never release someone else's lock after ours expired.

## `client`

The shared client, created on first use; 2-second timeouts so a stuck Redis can't hang a request.

## `hit`

Counts one hit in a fixed time window; True when still within the limit. Keys look like `rl:<name>:<window>`.

## `lock`

A lock across all processes (`SET NX PX`); yields True when we got it. The worker scheduler uses it so only one worker schedules at a time.

## `rate_limit`

`hit`, or raise 429 `rate` with `retry_after`. Used for login codes (per IP and per address), guest accounts per IP, invites, refresh, Untis lookups and more. Limits per IP are generous because **a whole school shares one IP**.

## `throttle`

Waits until `interval` seconds have passed since the last call with this name, across all workers. `untis._get_json` uses it to stay polite to each Untis server (`config.UNTIS_MIN_INTERVAL`).
