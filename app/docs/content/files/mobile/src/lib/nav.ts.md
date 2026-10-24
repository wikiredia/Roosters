---
updated: 2026-10-24T08:30:00Z
---

**Going somewhere without a way back.** `router.replace` only swaps the top screen: after onboarding, welcome →
school → campus → … stayed underneath, and a swipe back on Today walked back into onboarding.

## `resetTo`

Clears the stack (`dismissAll`), then replaces: used after signing in (`welcome`, `login/email`, `login/code`) and
when onboarding is finished or skipped (`lib/onboarding.useFinishOnboarding`). Use it for every 'you're in now'
step; plain `push` for screens you should be able to go back from.
