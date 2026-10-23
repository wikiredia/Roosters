---
updated: 2026-10-23T17:30:00Z
---

**Which API the app talks to**, in order: an address set on the debug screen (saved, no rebuild needed), `EXPO_PUBLIC_API_URL` (baked in at build time), or the computer running `expo start` on `EXPO_PUBLIC_API_PORT` (default 8000).

## `PORT`

The API port for the automatic address (`EXPO_PUBLIC_API_PORT`, default 8000).

## `apiOverride`, `loadServer`, `setApiOverride`

The debug-screen override: loaded at start (debug builds only), saved per device; `192.168.1.20:8010` becomes `http://192.168.1.20:8010`.

## `automaticApiBase`, `apiBase`

The automatic address and the one in use.

## `debugEnabled`

The debug screen and error details: always in development, otherwise only with `EXPO_PUBLIC_DEBUG=1`.
