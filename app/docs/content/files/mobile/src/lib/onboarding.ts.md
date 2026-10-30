---
updated: 2026-10-30T15:52:00Z
---

**Racing through onboarding.** Every step can be skipped, and you can start **without signing in** (a guest
account on this phone). What was skipped shows on Today as 'Nog te doen'
(`components/SetupSteps.tsx`).

Server side: `POST /api/v1/auth/guest`, and the upgrade logic in `api/roosters/r_auth.py`.

## `AuthMode`

Which welcome button brought you to sign in: `new` ('Create an account') or `login` ('I already have an account').

## `routeAfterSignIn`

Where to go after any sign-in (Apple, Google, e-mail code). Straight to `/` (the gate), unless the account isn't what
you asked for, from the server's `account` (`api/roosters/r_auth._answer`):
- `existing` and not `mode=login` ('Create an account', or a guest adding their e-mail, with an address that already
  has an account) → `login/found?kind=existing` ('you're signed in to it'; `guest=1` adds that the guest's setup came
  along where the account had none);
- `new` with `mode=login` (no account yet) → `login/found?kind=new` (keep it, or try another address).

## `afterSignIn`

After any sign-in: store the tokens, refetch everything (the user changed from guest to verified), and accept an invite that was waiting.

## `device`

Platform and a device name sent with every sign-in (shown in 'your sessions' and in the console).

## `freshenGuestToken`

Before signing in while already in the app (a guest confirming their e-mail): make sure the access token is fresh, so the server sees **the guest** and upgrades that account instead of creating a new one (an expired token would silently lose the guest's setup).

## `startAsGuest`

'Continue without signing in' (welcome screen, or Skip on the e-mail/code screens): creates a guest account and stores its tokens.

## `useFinishOnboarding`

'Skip' / 'Done' on any onboarding step: mark onboarding done (`onboarded: true`), accept a waiting invite (not for guests), and go to Today with nothing to go back to (`nav.resetTo`). Offline: Today opens anyway and the gate asks again next time.
