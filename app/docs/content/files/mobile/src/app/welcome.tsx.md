---
updated: 2026-10-30T09:29:00Z
---

The **first screen**, with two clear ways in: **Create an account** (primary) and **I already have an account**
(secondary), both to `login/index.tsx` (`mode=new` / `mode=login`) where Apple, Google and e-mail are; and **continue
without signing in** (a guest account: straight into the app, confirm your e-mail later from Today). Debug builds
show 'Server & debug'.

Picking the 'wrong' button is fine: the server finds an account by its verified address either way
(`api/roosters/r_auth._sign_in`), and `login/found.tsx` says what happened ('you already had an account, you're signed
in' / 'no account with this address yet').

## `LEGAL_URL`

Terms and privacy link (`EXPO_PUBLIC_LEGAL_URL`).

## `Welcome`

After the server ended the session it says so ('Je bent afgemeld…', or for `reuse` that it was used somewhere
else).

The sign-in methods themselves moved to `login/index.tsx`. Errors here are only the guest's (offline).
