---
updated: 2026-10-30T02:00:00Z
---

Expo app config: name Roosters+, slug and URL scheme `roostersplus` (invite links `roostersplus://i/<code>`), bundle id `be.roostersplus.app`, portrait only, light/dark automatic, Sign in with Apple enabled, splash and adaptive icons, plugins (router, fonts, secure store, localization, Apple auth, camera and image picker with their permission texts,
notifications with the Android notification icon `assets/notification-icon.png` and colour, splash), typed routes. `ios.infoPlist.CADisableMinimumFrameDurationOnPhone`: lets animations run at 120 Hz on ProMotion iPhones
(without it iOS caps an app at 60; native change, needs a new build).
Push also needs `extra.eas.projectId`, which `npx eas-cli init` adds (see `src/lib/push.ts`).
The Sign in with Google plugin is **not** here but in `app.config.ts`, because its iOS URL scheme comes from an environment variable.
