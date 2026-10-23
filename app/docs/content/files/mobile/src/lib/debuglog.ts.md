---
updated: 2026-10-23T17:30:00Z
---

The last 40 requests as the app saw them, for the debug screen and error details. **Never** holds tokens or request bodies.

## `MAX`

How many requests the log keeps (40).

## `RequestLog`, `requestLog`, `logRequest`

One entry (method, URL, time, status, outcome, a snippet of a non-JSON answer) and the store.

## `describe`

One readable line: 'POST …/email/start → something else answered instead of the Roosters+ API (200, text/html)'.
