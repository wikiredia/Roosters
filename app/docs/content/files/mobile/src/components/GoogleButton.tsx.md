---
updated: 2026-10-30T09:29:00Z
---

**'Ga verder met Google'**, used on the sign-in screen (`app/login/index.tsx`, next to Sign in with Apple) and, for
guests, on the e-mail screen. Renders **nothing** unless `lib/google.googleSupport()` is `ready` (web, Expo Go, no client ids, an old build),
so screens don't have to check; they only check to pick the e-mail button's variant or show 'of'.

Google's branding guidelines, fitted to our tokens: the full-colour 'G' (never recoloured), Google's own fill, 1px
stroke and text colour for light and dark (`--color-google-fill`, `--color-google-stroke`, `--color-google-ink` in
`global.css`), and the same height (52) and corners (`rounded-button`) as the Apple button, so both get equal weight.
The label is in our UI font (bold), not Google Sans: that font is 2 MB, loaded at every start, for one button.

## `GoogleButton`

Runs `signInWithGoogle`, then `lib/onboarding.routeAfterSignIn` with `mode` (which welcome button you came from) and
whether you were a guest: usually `/` (the gate decides: onboarding or Today), or `login/found` when the account isn't
what you asked for. Errors go to the screen through
`onError(message, detail)`: a short text in the user's language, plus Google's code for debug builds.

## `PROBLEM`

`GoogleProblem` → text key (`google.playServices`, `google.notSetUp`, `google.failed`).

## `GoogleG`

Google's standard 'G' as SVG, hidden from screen readers (the button has the label).
