---
updated: 2026-10-24T13:40:00Z
---

**Pinned friends first**, the order of friends in the app. The server already sends friends in this order
(`api/roosters/friends.py` `visible_friends`) and sorts Today's board and shared breaks the same way; these keep a pin
you just set in place before the server answers (`api/hooks.ts` `usePinFriend`) and sort lists the app builds itself.

## `pinnedFirst`

Friends you pinned first, then by name (a new list). The friends list and the optimistic update of `usePinFriend`.

## `pinnedOnTop`

Pinned ones first, otherwise the order stays (a stable sort, a new list): Today's board (then whoever is free first,
as the server sent it) and the people within one shared break.
