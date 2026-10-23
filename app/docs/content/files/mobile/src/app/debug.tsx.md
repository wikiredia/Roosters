---
updated: 2026-10-23T17:30:00Z
---

**Server & debug**: only in development builds (or with `EXPO_PUBLIC_DEBUG=1`). Developer-facing, so English only on purpose. Set the API address without rebuilding, check the connection, see the server's mail diagnosis (`GET /api/v1/debug`), send a test mail, and see the last requests.

## `DebugScreen`

The screen.

## `DiagView`

The server's diagnosis as readable rows with hints.

## `Diagnose`, `Check`, `errorText`

The diagnosis shape, a check result, and error text for any error.
