---
updated: 2026-10-24T13:30:00Z
---

Step 7 of 8: **your invite link**, or classmates already on Roosters+. Skipping is fine; Next and Skip both go to the notifications step (`onboarding/notifications.tsx`), or finish onboarding when this phone can't get push (`lib/push.pushAvailable`: web, Expo Go on Android, no EAS project id).

## `FriendsStep`

Finishing (`lib/onboarding.useFinishOnboarding`, which also accepts a waiting invite) now usually happens one step later, in the notifications step.
