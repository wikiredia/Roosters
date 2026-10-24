---
updated: 2026-10-24T16:00:00Z
---

**Signed-in state.** The tokens live in the phone's secure storage (`storage.secrets`), and the access token also
in memory. `session` is a tiny store the root layout and the gate subscribe to: signedOut → welcome
screen, signedIn → the app. Signing out clears the query cache (`app/_layout.tsx`).

## `Session`, `Tokens`

The session states and the token pair the API returns.

## `accessToken`, `refreshToken`

Current tokens (memory).

## `accessExpiresSoon`

The access token runs out within a minute: `lib/api.ts` refreshes before asking. When it runs out is counted
from `expires_in` on this phone's clock when the pair arrived (`accessUntil`, stored as `access_until`), so a
phone clock that's off doesn't matter.

## `clearSession`

Forget the tokens and sign out. `ended` (the server's reason) is set when the server ended the session: the
root layout then goes to welcome from wherever you are, and welcome says you were signed out.

## `loadSession`

At start: read the tokens from secure storage.

## `saveTokens`

Store a new pair (after sign-in or refresh) and mark the session signed in. Written to secure storage *before*
anything uses it (the server stops taking the old refresh token once the new pair is used); a keychain error
gets a second try.

## `session`

The observable session state.
