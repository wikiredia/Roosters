---
updated: 2026-10-24T08:30:00Z
---

**Racing through onboarding.** Every step can be skipped, and you can start **without signing in** (a guest
account on this phone). What was skipped shows on Today as 'Complete the following steps'
(`components/SetupSteps.tsx`).

Server side: `POST /api/v1/auth/guest`, and the upgrade logic in `api/roosters/r_auth.py`.

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
