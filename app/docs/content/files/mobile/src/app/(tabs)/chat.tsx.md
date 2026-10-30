---
updated: 2026-10-30T10:30:00Z
---

**Chat** (design: Chat.dc.html A): friend requests on top, then pinned chats, your groups, and your friends. A friend you haven't written yet is in
the list too ("Nog geen berichten. Zeg hallo!"), so starting a chat is one tap (`useOpenDirect`). Each row: the
name, the last message ("Lotte: …", "Jij: …"), when, a small bell when you get a push for it, and a rose badge
with the unread count (bold when unread); a chat with an open break or access request (`Chat.requests > 0`) has a
small yellow "Verzoek" tag in its corner, next to the time. "+"
makes a group (`app/chat/new.tsx`). Guests are asked to confirm their e-mail; nobody to chat with leads to adding a
friend.

## `ChatScreen`

The screen; pull to refresh asks for the chats and friends again.

## `FriendRequests`

"Verzoeken": friend requests aren't in a chat (a chat only exists between friends), so they're pinned on top here,
folded by default; the header shows a rose badge with how many came in (`useRequests`). Open: who asked you with ✓
(accept, then `useOpenDirect` and on to the new chat) and ✗ (decline), who you asked with "Wacht op antwoord" and ✗
(take it back). Nothing when there are none. The tab's badge counts these too (`components/BottomTabs`).

## `ChatList`, `ChatRow`

A titled card of chats, and one chat (group: the first three avatars stacked).
