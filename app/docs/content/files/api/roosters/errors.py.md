---
updated: 2026-10-23T17:30:00Z
---

One error type for the whole API. Raise `ApiError(status, code, **extra)` anywhere; `app.py` (and
`admin.py`) turn it into `{"code", "message", ...extra}` with a translated message.

**Adding an error code:** add the Dutch and English text to `i18n.ERRORS` (otherwise the message falls
back to the generic `server` text), and handle the code in the app if it needs special behaviour.

## `ApiError`

status = the HTTP status; code = a stable string the app can branch on; extra = more fields in the JSON (e.g. `retry_after`, `limit`).

## `bad`, `not_found`

Shortcuts for the most common errors (400 and 404).
