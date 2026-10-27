---
updated: 2026-10-24T10:30:00Z
---

**The gate**: where the app opens. Not signed in → welcome. Signed in and onboarding **finished or
skipped** (`user.onboarded`) → Rooster, always. Otherwise the first unfinished step: school, then classes,
then courses.

Everything skipped shows on Today as 'Complete the following steps' (`components/SetupSteps.tsx`), so the
gate never forces anyone back into onboarding.

## `Gate`

As above. The very first start after signing in (nothing cached yet) shows one calm screen with the mascot, never a spinner. When the API can't be reached it offers a way out: **Server & debug** (debug builds, to fix the address) and **Sign out**.

Without a school it starts at the name-and-photo step (`onboarding/profile`), which goes on to the school.
