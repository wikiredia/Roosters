---
updated: 2026-10-24T13:20:00Z
---

**Chat** (design: Chat.dc.html A): pinned chats, your groups, and your friends. A friend you haven't written yet is in
the list too ("Nog geen berichten. Zeg hallo!"), so starting a chat is one tap (`useOpenDirect`). Each row: the
name, the last message ("Lotte: …", "Jij: …"), when, a small bell when you get a push for it, and a rose badge
with the unread count (bold when unread). "+"
makes a group (`app/chat/new.tsx`). Guests are asked to confirm their e-mail; nobody to chat with leads to adding a
friend.

## `ChatScreen`

The screen; pull to refresh asks for the chats and friends again.

## `ChatList`, `ChatRow`

A titled card of chats, and one chat (group: the first three avatars stacked).
