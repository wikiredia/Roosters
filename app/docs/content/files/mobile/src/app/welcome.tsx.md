---
updated: 2026-10-24T16:01:00Z
---

The **first screen**: Sign in with Apple (iOS), **continue with Google** (`components/GoogleButton.tsx`, only where it can work: a development build with client ids), continue with e-mail, or **continue without signing in** (a guest account: straight into the app, confirm your e-mail later from Today). Debug builds show 'Server & debug'.

## `LEGAL_URL`

Terms and privacy link (`EXPO_PUBLIC_LEGAL_URL`).

## `Welcome`

After the server ended the session it says so ('Je bent afgemeld…', or for `reuse` that it was used somewhere
else).

Apple sign-in sends the raw nonce to our server and its hash to Apple (`api/roosters/providers.apple`); Google's flow is in `lib/google.ts`; every sign-in goes through `lib/onboarding.afterSignIn`. With Apple or Google shown, the e-mail button becomes secondary. Errors show under the buttons; in debug builds with Google's own code underneath (a wrong SHA-1 or client id says so there).
