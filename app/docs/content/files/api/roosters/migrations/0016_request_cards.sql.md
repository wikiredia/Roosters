---
updated: 2026-10-30T13:30:00Z
---

**Requests in the chat, access requests, and today's plan in two parts.**

- `chat_messages.kind` gets `'request'`: a request card, written by the asker (`user_id`), payload
  `{"type":"break"|"access","request":<id>}`. Only a pointer: the live request is added when messages are read
  (`chat.with_requests`).
- `checkins.break_status` (`want_chill`, `busy`; for the breaks between classes) is new and `checkins.status`
  becomes NULLable: a row can carry only the break part (`r_me.checkin`).

## `access_requests`

"Mag ik je rooster zien?" (`access.py`): `from_id` asks `to_id` to show them `visibility` (full or norooms).
`status` pending → accepted / declined / cancelled (`decided_at`); unfriending or blocking cancels pending ones.
Deleted with either account (`access.delete_user`), in the export of both.
