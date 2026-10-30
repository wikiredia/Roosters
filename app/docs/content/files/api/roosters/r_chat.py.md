---
updated: 2026-10-30T15:07:00Z
---

Routes for **chat** (`/api/v1/chats`); the rules are in `chat.py`. Everything needs a signed-in, non-guest
account (`deps.verified`), like friends. Reads use `etag_json`: the app asks for the list every 15 s and an open
conversation every 3 s, mostly getting an empty "not modified". Sending carries an Idempotency-Key from the app:
a retry on bad wifi is stored once.

Rate limits: 40 messages a minute, 20 new groups and 30 reports an hour, 120 one-to-one opens an hour.

Errors (translated in `i18n.py`): `chat_gone`, `not_friends`, `chat_name`, `chat_people`, `chat_full`
(`limit`), `chat_direct`, `chat_empty`, `chat_long`, `chat_message_gone`, `chat_report_own`.

## `list_chats`

`GET /api/v1/chats` → `{chats, unread}`.

## `DirectIn`, `direct`

`POST /api/v1/chats/direct` `{user_id}` → `{chat}`: the one-to-one chat with a friend (made the first time),
with `breaks` like `get_chat`.

## `GroupIn`, `new_group`

`POST /api/v1/chats` `{name, user_ids}` → 201 `{chat}`.

## `get_chat`

`GET /api/v1/chats/{id}` → `{chat}` with everyone in it and how far they read; a one-to-one chat also
`breaks: [{day, start, end, asked}]` (`breaks.shared_with`: the breaks you share this school week, for the "Pauze
samen?" suggestion). ETag: the body changes when one is asked.

## `ChatPatch`, `edit_chat`

`PATCH /api/v1/chats/{id}` `{name?, pinned?, push?}`: rename a group, pin a chat or turn its bell (a push for every
message) on, the last two only for you. Every chat in the answers has `push`.

## `MembersIn`, `add_members`, `leave`

`POST /api/v1/chats/{id}/members` `{user_ids}` (your friends), `DELETE /api/v1/chats/{id}/members/me` → 204.

## `messages`

`GET /api/v1/chats/{id}/messages[?after=|before=&limit=]` → `{messages, more}`, oldest first.

## `MessageIn`, `send`

`POST /api/v1/chats/{id}/messages` `{body}` → 201 `{message}`.

## `take_back`

`DELETE /api/v1/chats/{id}/messages/{message_id}` → 204: your own message, gone for everyone.

## `ReadIn`, `read`

`POST /api/v1/chats/{id}/read` `{up_to_id}` → 204.

## `ReportIn`, `report`

`POST /api/v1/chats/messages/{message_id}/report` `{reason, note?, block?}` → `{reported, blocked}`. The
moderators see it in the admin API; the writer doesn't.
