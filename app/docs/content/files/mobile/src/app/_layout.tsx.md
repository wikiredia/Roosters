---
updated: 2026-10-30T02:00:00Z
---

The **root layout**: loads fonts, the server address, the session and the language before showing anything (the splash screen stays up until then); starts the network and focus watchers; wraps the app in the gesture root (`react-native-gesture-handler`) and the persisted query cache; every push uses the iOS-style slide (with swipe back) on both platforms, except the app itself (`(tabs)`, `index`): nothing to swipe back to there; clears that cache when you sign out. Every screen is a Stack screen without the native header (`components/ui/Screen.tsx` draws ours). The `Stack` is inside
`SheetHost` (`components/ui/SheetHost.tsx`): every bottom sheet is drawn in that one layer over the app, not in a native
`Modal`, so it's above the tab bar and pushed screens, and Android back closes it.

## `RootLayout`

When the server ends the session (`session.ended`, from a refused refresh), it goes to welcome from wherever
you are (onboarding, settings, a sheet) with `nav.resetTo`, instead of every screen showing `auth_expired`.

As above. Bump `buster` when the shape of cached data changes, so old caches are dropped (`v2-2`: classes came with their semesters).
Only what `lib/query.shouldPersist` allows is saved. The `PerfOverlay` (fps meter) is mounted after the `SheetHost`, over the sheets; it renders
nothing unless it's switched on in Server & debug (`debugEnabled` builds only).
