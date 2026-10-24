---
updated: 2026-10-24T13:45:00Z
---

The **dynamic part of the app config**: Expo reads `app.json` first and passes it to this function, which adds what
comes from the environment. Today that's one thing: the **Sign in with Google** config plugin
(`react-native-nitro-google-signin`) with the iOS URL scheme made from `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
Everything else stays in `app.json` (which `npx expo install` and `eas-cli` can still edit).

The values come from `app/mobile/.env` (or `.env.local`, or EAS environment variables): Expo CLI loads them both for
this file (prebuild, `expo run`, EAS Build) and for the bundle (`EXPO_PUBLIC_*` in `src/lib/google.ts`), so the URL
scheme in the build and the client id in the JavaScript match. Changing the iOS client id needs a **new build**, not
just a Metro restart. `npx expo config` shows the result.

## `googleIosUrlScheme`

`<id>.apps.googleusercontent.com` → `com.googleusercontent.apps.<id>` (Google's `REVERSED_CLIENT_ID`): iOS sends
the sign-in back to the app on this scheme. Without it, Google's iOS SDK refuses to sign in, which is why the app
hides the button on iOS until the iOS client id is set.

## `GOOGLE_SCHEME_UNSET`

Placeholder scheme used while there is no iOS client id. The plugin has to run on **every** iOS build anyway: besides
the URL scheme it adds modular headers for Google's pods to the Podfile, without which `pod install` fails as soon as the
module is linked. The placeholder scheme is never used (no client id → no button).
