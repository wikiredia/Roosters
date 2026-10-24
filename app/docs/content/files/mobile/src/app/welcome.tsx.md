---
updated: 2026-10-24T08:30:00Z
---

The **first screen**: Sign in with Apple (iOS), continue with e-mail, or **continue without signing in** (a guest account: straight into the app, confirm your e-mail later from Today). Debug builds show 'Server & debug'.

## `LEGAL_URL`

Terms and privacy link (`EXPO_PUBLIC_LEGAL_URL`).

## `Welcome`

Apple sign-in sends the raw nonce to our server and its hash to Apple (`api/roosters/providers.apple`); every sign-in goes through `lib/onboarding.afterSignIn`.
