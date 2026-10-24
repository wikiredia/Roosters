---
updated: 2026-10-24T02:00:00Z
---

The **root layout**: loads fonts, the server address, the session and the language before showing anything (the splash screen stays up until then); starts the network and focus watchers; wraps the app in the gesture root (`react-native-gesture-handler`) and the persisted query cache; every push uses the iOS-style slide (with swipe back) on both platforms; clears that cache when you sign out. Every screen is a Stack screen without the native header (`components/ui/Screen.tsx` draws ours).

## `RootLayout`

As above. Bump `buster` when the shape of cached data changes, so old caches are dropped (`v2-2`: classes came with their semesters).
