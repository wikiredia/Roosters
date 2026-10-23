---
updated: 2026-10-23T17:30:00Z
---

Troubleshooting endpoints for the laptop and the test server. They answer **404 unless ENV=dev**
(`dev_only`), so they can't leak mail setup on a real server. The app's debug screen
(`mobile/src/app/debug.tsx`) calls them.

## `TestMailIn`, `test_mail`

`POST /api/v1/debug/mail`: send a test mail right away (10 per hour per IP).

## `dev_only`

Dependency: 404 outside ENV=dev.

## `diagnose`

`GET /api/v1/debug`: `debug.diagnose()`.
