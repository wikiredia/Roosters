---
updated: 2026-10-23T17:30:00Z
---

The **root layout**: loads fonts, the server address, the session and the language before showing anything (the splash screen stays up until then); starts the network and focus watchers; wraps the app in the persisted query cache; clears that cache when you sign out. Every screen is a Stack screen without the native header (`components/ui/Screen.tsx` draws ours).

## `RootLayout`

As above. Bump `buster` when the shape of cached data changes, so old caches are dropped.
