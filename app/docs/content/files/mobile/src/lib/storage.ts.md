---
updated: 2026-10-23T17:30:00Z
---

Two kinds of storage: `prefs` (AsyncStorage, small preferences: language, server override, pending invite; never secrets) and `secrets` (the keychain/keystore through expo-secure-store; the web build falls back to AsyncStorage).

## `prefs`, `secrets`

get/set/remove with keys prefixed `rp:`; `prefs` never throws (preferences are optional).
