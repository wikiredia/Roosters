---
updated: 2026-10-30T15:00:00Z
---

**Which API the app talks to**, in order: an address set on the debug screen (saved, no rebuild needed), `EXPO_PUBLIC_API_URL` (baked in at build time), or the computer running `expo start` on `EXPO_PUBLIC_API_PORT` (default 8000).

## `PORT`

The API port for the automatic address (`EXPO_PUBLIC_API_PORT`, default 8000).

## `apiOverride`, `loadServer`, `setApiOverride`

The debug-screen override: loaded at start (only where `isDebug()`, after loading the remembered `debugAccount`), saved per device; `192.168.1.20:8010` becomes `http://192.168.1.20:8010`.

## `automaticApiBase`, `apiBase`

The automatic address and the one in use.

## `debugBuild`, `debugAccount`, `isDebug`, `useDebug`, `setDebugAccount`

The debug screens (Server & debug, Test data & users), the fps overlay and error details: in a debug build
(`debugBuild`: development, or `EXPO_PUBLIC_DEBUG=1`), and in **every build, production too, for the owner's account**
(`debugAccount`: the API's `User.debug`, set by `api/hooks.useMe` through `setDebugAccount` on every /me answer). It's
remembered on the phone (`prefs` 'debugAccount'), so it's there at the next start before /me answers and on the
sign-in screens after signing out; another account's /me turns it off. `isDebug()` outside React, `useDebug()` in
screens.
