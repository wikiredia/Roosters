---
updated: 2026-10-24T02:00:00Z
---

**Every screen** uses this: safe area, the header (large title for tabs, or a back button with a small title, or onboarding progress), the network banner, scrollable content with pull-to-refresh, and an optional sticky footer.

## `Empty`

An empty state with the mascot.

## `ScreenProps`, `Screen`

As above. `navRight` holds the onboarding **Skip** buttons. `onRefresh` may return a promise: the
pull-to-refresh spinner shows **only while a pull you made** is running. A background refetch (after saving
something, coming back to the app, polling) never shows it or moves the page down.

## `Skeleton`

A skeleton line: only for the very first load, never a full-screen spinner.
