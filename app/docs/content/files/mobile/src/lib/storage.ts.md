---
updated: 2026-10-30T12:30:00Z
---

Two kinds of storage: `prefs` (AsyncStorage, small preferences: language, server override, pending invite, experiments (`lib/labs.ts`); never secrets) and `secrets` (the keychain/keystore through expo-secure-store; the web build falls back to AsyncStorage).

## `prefs`, `secrets`

Tokens are written readable *after the first unlock* (`AFTER_FIRST_UNLOCK`), so a refresh that finishes while
the phone is locked in your pocket can still be saved.

get/set/remove with keys prefixed `rp:`; `prefs` never throws (preferences are optional).
