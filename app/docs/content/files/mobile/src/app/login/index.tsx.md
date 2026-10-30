---
updated: 2026-10-30T09:30:00Z
---

**How to sign in**, after the welcome screen's 'Create an account' (`mode=new`, onboarding step 1 of 9) or 'I already
have an account' (`mode=login`, no progress bar): Sign in with Apple (iOS; the button says 'Sign up with Apple' or
'Sign in with Apple'), Google (`components/GoogleButton.tsx`, where it can work) and e-mail (`login/email.tsx`, the
mode goes along). The same three either way: which one you came for only changes the words, and what is said
afterwards when the account isn't what you asked for (`lib/onboarding.routeAfterSignIn` → `login/found.tsx`).

A line under the buttons says what happens with an address that already has an account ('then we simply sign you
in to it') or none ('we'll tell you, and you choose'), and a link switches to the other mode.

## `LoginChoice`

Apple sign-in sends the raw nonce to our server and its hash to Apple (`api/roosters/providers.apple`); every sign-in
goes through `lib/onboarding.afterSignIn`, then `routeAfterSignIn` with the mode. With Apple or Google shown, the
e-mail button becomes secondary. Errors show under the buttons; in debug builds with Google's own code underneath (a
wrong SHA-1 or client id says so there).
