---
updated: 2026-10-24T13:30:00Z
---

**Push notifications** on the phone (`expo-notifications`). The server side is `api/roosters/push.py`: it writes the
texts and decides who gets what; this file gets the phone ready, gives the server its token, and handles what
happens when a push comes in or is tapped.

Remote push needs a **development build** (Expo Go on Android can't, since SDK 53) and an **EAS project id**:
`npx eas-cli init` writes `extra.eas.projectId` into `app.json`. Without one `pushState` is `noProject` (the phone is never asked: a yes would get you nothing) and Meldingen
says the app can't get notifications yet. Expo Go on Android is `unsupported` straight away (`isRunningInExpoGo`). The config plugin in `app.json` sets the Android notification icon
(`assets/notification-icon.png`, white on transparent) and colour.

## `registerPush`

At every start once signed in (`(tabs)/_layout`), from Meldingen and from the onboarding step (`app/onboarding/notifications.tsx`).
Web and Expo Go on Android: `unsupported`; no EAS project id: `noProject`, both before anything is asked. Creates the Android channels first (Android
13+ only asks once a channel exists), asks the phone only with `ask` (after a tap in Meldingen or the onboarding step, never out of the
blue), registers the Ja / Nee / Ander uur buttons, gets the Expo token and sends it to `PUT /api/v1/me/push-token`.
Notifications turned off in the phone's settings: tells the server (`DELETE`) once. Never throws: the outcome is in
`pushState`.

## `PushState`, `pushState`

`undetermined` (not asked yet), `denied` (off in the phone's settings), `granted`, `unsupported` (web, Expo Go on Android), `noProject`,
`failed` (a simulator, no network). Meldingen, the Ik row, the onboarding step and Today's steps (`undetermined` = still to do) show it.

## `pushAvailable`

Can this phone get push at all (iOS/Android, not Expo Go on Android, an EAS project id)? Synchronous, asks the phone
nothing: the week and friends steps use it to leave out the notifications step where it can't work.

## `PushData`

What the server puts in `data`: `kind`, `url` (the screen to open), `chat`, `request`, `day`.

## `setOpenChat`

The chat on screen (`chat/[id]` sets it while focused): its messages don't come in as a banner while the app is open.

## `handlePushResponses`

In the tabs layout, so whatever it opens lands on top of the tabs (signed in and set up). The push that opened the
app (`getLastNotificationResponse`, also from a cold start) and every tap after: Ja / Nee answers the break request
(`POST /breaks/{id}/respond`) and opens Today; anything else opens `data.url`.

## `refresh`, `onResponse`

A push came in or was tapped: ask again for what it's about (chats, a conversation, Today, the breaks, the
timetable). The notification handler (set when this file loads) does it for pushes that arrive while the app is open.

## `setUpChannels`, `setUpCategories`, `projectId`, `set`, `t`, `SUPPORTED`, `EXPO_GO_ANDROID`

The Android channels `requests`, `changes`, `chat` (the server picks one per push; their names are the Meldingen
categories, in the app's language), the `break_request` category with its three buttons (they open the app: an
answer in the background isn't reliable when the app was closed), the EAS project id, and small helpers.

## `sendTestPush`

The debug screen's "Send a test push" (`POST /api/v1/debug/push`).
