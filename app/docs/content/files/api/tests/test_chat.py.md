---
updated: 2026-10-30T15:07:00Z
---

Chat through the API: the pure parts, a one-to-one chat (same chat from both sides, unread and read, "gelezen",
taking a message back), only between friends (gone after unfriending, back with its history when friends again),
groups (adding friends, events, rename, pin only for you, leaving, nothing of that for one-to-one chats), blocking
and reporting with the moderators' side (context, removing for everyone, turning the writer off), a planned break
showing up as an event (in a shared group, not in the chat with its card), a request card showing the request as it
is now (its shape from both sides, the `requests` count, the ETag changing when it's answered, cancelled stays on
the card, a card can't be deleted), the shared breaks of a one-to-one chat this school week (`breaks`, `asked`
from either side and back after taking it back, none in a group or with a hidden friend; "now" is a Wednesday via a
monkeypatched `schedule.local_now`), and account deletion with its export.

## `three`, `_send`, `_chats`, `A`

Reda, Kayra and Lotte, all friends; send a message; the chat list; the admin token headers.
