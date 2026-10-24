---
updated: 2026-10-24T14:00:00Z
---

The last 40 requests as the app saw them, for the debug screen and error details. **Never** holds tokens or request bodies.

## `MAX`

How many requests the log keeps (40).

## `RequestLog`, `requestLog`, `logRequest`

One entry (method, URL, time, status, outcome, a snippet of a non-JSON answer) and the store.

## `markRecovered`

Marks the latest 401 for a request as **recovered**: `lib/api.ts` refreshed the tokens and asked again (the
retry is the next entry). The debug screen shows it as ↻ instead of a red ✗, so a normal expired access token
doesn't look like `auth_expired` breaking the app.

## `describe`

One readable line: 'POST …/email/start → something else answered instead of the Roosters+ API (200, text/html)'.
