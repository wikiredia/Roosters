---
updated: 2026-10-30T10:30:00Z
---

**All friends**. Friend requests aren't here any more: they're on top of the Chat tab (`app/(tabs)/chat.tsx`). Guests see 'Friends need your e-mail' (`components/VerifyFirst`).

## `FriendsScreen`

Friends (design: Ik-1.dc.html B) in two cards: the ones
you pinned under 'Vastgezet · bovenaan in Vandaag', then 'Andere vrienden · n' (just 'Alle vrienden · n' when
nothing is pinned). Each row opens the friend; the thumbtack on its right pins or unpins at once (`usePinFriend`,
filled blue when pinned; the label says '{name} vastzetten' / '{name} losmaken').
