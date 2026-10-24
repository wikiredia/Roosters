---
updated: 2026-10-24T14:06:00Z
---

**Server & debug**: only in development builds (or with `EXPO_PUBLIC_DEBUG=1`). Developer-facing, so English only on purpose. Set the API address without rebuilding, check the connection, see the server's mail diagnosis (`GET /api/v1/debug`), send a test mail, send a test push to your own phones (registers this one first; says why when there's
none, e.g. no EAS project id), see whether **Sign in with Google** can show on this phone and why not, and see the last requests (✓ ok, ✗ failed, ↻ a 401 that a token refresh fixed).

## `DebugScreen`

The screen.

## `DiagView`

The server's diagnosis as readable rows with hints.

## `GOOGLE_STATUS`

`lib/google.googleSupport()` in words: ready, or what to set or build (Expo Go, no client ids, an old build).

## `Diagnose`, `Check`, `errorText`

The diagnosis shape, a check result, and error text for any error.
