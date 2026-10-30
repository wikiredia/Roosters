---
updated: 2026-10-30T09:30:00Z
---

**After signing in, when the account isn't what you asked for** (`lib/onboarding.routeAfterSignIn`, from the server's
`account` in `api/roosters/r_auth._answer`). No way back (`_layout.tsx`: no swipe; `nav.resetTo`).

- `kind=existing`: 'Create an account' (or a guest adding their e-mail) with an address that already had an account.
  You're signed in to that account: 'Welcome back, Ana! There already was an account with this address…'. With
  `guest=1` it adds that what you set up as a guest came along where the account had nothing
  (`api/roosters/accounts.fold_guest`). Continue → `/` (the gate: Rooster when that account finished onboarding).
- `kind=new`: 'I already have an account', but there was none, so one was just made. **Continue with this new
  account** (→ `/`, onboarding), or **Another address or way**: the new, still empty account is deleted again
  (`DELETE /api/v1/me`), the session cleared, and you're back at signing in (`/login?mode=login`).

Whether an address has an account is only told here, after the code (or Apple/Google) proved it's yours:
`email/start` never says it.

## `Found`

As above. `email` (when known: the e-mail code) is named in the text.
