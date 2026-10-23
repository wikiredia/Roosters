---
updated: 2026-10-23T17:30:00Z
---

**Signed-in state.** The tokens live in the phone's secure storage (`storage.secrets`), and the access token also
in memory. `session` is a tiny store the root layout and the gate subscribe to: signedOut → welcome
screen, signedIn → the app. Signing out clears the query cache (`app/_layout.tsx`).

## `Session`, `Tokens`

The session states and the token pair the API returns.

## `accessToken`, `refreshToken`

Current tokens (memory).

## `clearSession`

Forget the tokens and sign out.

## `loadSession`

At start: read the tokens from secure storage.

## `saveTokens`

Store a new pair (after sign-in or refresh) and mark the session signed in.

## `session`

The observable session state.
