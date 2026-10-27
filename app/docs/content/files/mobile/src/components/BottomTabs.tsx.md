---
updated: 2026-10-27T17:30:00Z
---

The **bottom tab bar** as a plain component: Rooster, Today, Chat, Me (the brand's active pill). `app/(tabs)/_layout.tsx`
renders it for the tab navigator; `app/compare.tsx` renders it too, so the bar stays visible while comparing.
The Chat tab carries a rose badge with your unread messages (`useChats`).

## `TABS`

The tabs in order (Rooster first: it is where the app opens), with icon and label.

## `BottomTabs`

`active` is the lit tab, `onSelect(name)` is what a press does.
