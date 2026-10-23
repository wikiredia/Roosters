---
updated: 2026-10-23T17:30:00Z
---

**The gate**: where the app opens. Not signed in → welcome. Signed in and onboarding **finished or
skipped** (`user.onboarded`) → Today, always. Otherwise the first unfinished step: school, then classes,
then courses.

Everything skipped shows on Today as 'Complete the following steps' (`components/SetupSteps.tsx`), so the
gate never forces anyone back into onboarding.

## `Gate`

As above. The very first start after signing in (nothing cached yet) shows one calm screen with the mascot, never a spinner.
