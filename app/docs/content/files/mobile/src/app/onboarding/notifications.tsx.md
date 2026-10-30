---
updated: 2026-10-30T09:31:00Z
---

Step 9 of 9, the last one: **notifications, asked in context** (design prompt, onboarding step 9). It comes after the
friends step (guests: after the week), so the reason is fresh: your friends can now ask you for a break. The phone's
own question comes **only after 'Zet meldingen aan'**, never when the screen opens.

What it shows: a short reason (break requests, timetable changes; chats stay quiet unless you turn on a chat's bell),
two made-up pushes as they'll look ('Pauze samen?' with Ja / Nee, 'Roosterwijziging morgen'), and the three main
Meldingen toggles (`usePush` / `useSetPush`, the same server settings as `settings/notifications.tsx`; quiet hours
stay in Meldingen). Texts are `pushStep.*` (and the shared `push.*`) in `i18n/nl.ts` + `en.ts`.

How it ends, all through `lib/push.registerPush` (no token logic here):

- **Allowed** → onboarding is finished (`lib/onboarding.useFinishOnboarding`) and you're on Today.
- **Refused by the phone** → not asked again (no loop): a card says how to turn it on and opens the phone's settings
  (`Linking.openSettings`); Next finishes. Back from the settings (`AppState` active) it checks again.
- **Already allowed** (Android below 13, or allowed before) → 'Meldingen staan aan' with the toggles and Next.
- **'Niet nu' / Skip** → finish; Today keeps 'Zet meldingen aan' in its steps (`components/SetupSteps.tsx`) while
  the phone hasn't been asked.
- **Can't get push** (web, Expo Go on Android, no EAS project id): the week and friends steps skip this screen
  (`lib/push.pushAvailable`); should it open anyway, it shows why and Next finishes.

From Today's steps (`from=settings`): no progress bar and no Skip, and it goes back instead of finishing.

## `NotificationsStep`

The screen. `Example` (not exported) draws one example push with the app icon.
