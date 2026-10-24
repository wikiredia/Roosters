---
updated: 2026-10-24T16:00:00Z
---

Sixth migration: **refresh-token generations** and **why a session ended**, on `sessions` (`tokens.py`).
`gen` counts rotations and goes into every access token; `seen_gen` is the newest generation the phone has
used. A previous refresh token is accepted as a retry after a lost answer as long as `seen_gen < gen` (the
phone never got, or never used, the newer pair), so an app closed or reloaded halfway through a refresh never
ends the session. `revoked_reason` (logout, logout_all, reuse, guest_signed_in, disabled, admin) comes back
as `reason` in the 401 of `/auth/refresh`, and the app shows it in its debug log and on welcome.

## `sessions (alter at line 6)`, `sessions (alter at line 7)`, `sessions (alter at line 8)`

The `gen`, `seen_gen` and `revoked_reason` columns.
