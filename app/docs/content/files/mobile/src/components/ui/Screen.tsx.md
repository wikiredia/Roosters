---
updated: 2026-10-24T11:30:00Z
---

**Every screen** uses this: safe area, the header (large title for tabs, or a back button with a small title, or onboarding progress), the network banner, scrollable content with pull-to-refresh, and an optional sticky footer.

## `Empty`

An empty state with the mascot.

## `ScreenProps`, `Screen`

As above. `navRight` holds the onboarding **Skip** buttons. `navSub` is a small line under `navTitle` (a chat's "5 leden ·
2 nu vrij"). The eyebrow above a tab title has the whole width and
one line, so a long date never pushes the page down. `heading` replaces the large title's text (the Rooster tab
turns it into 'Terug'); `title` still decides that there is a large-title header. `onRefresh` may return a promise: the
pull-to-refresh spinner shows **only while a pull you made** is running. A background refetch (after saving
something, coming back to the app, polling) never shows it or moves the page down. The content moves up for the keyboard
(`automaticallyAdjustKeyboardInsets`) and dragging it closes the keyboard; `scrollRef` lets a screen scroll
itself (the class search scrolls its field to the top).

## `Skeleton`

A skeleton line: only for the very first load, never a full-screen spinner.

`onBack` replaces what the back button does (Vergelijken goes back a step); `navCenter` replaces the small title
(a chat's photo), `navBelow` is a centred line under the nav row (the chat's name).
