---
updated: 2026-10-24T13:10:00Z
---

**Chat**: one-to-one chats between friends and groups of friends, text messages and events, read up to where,
pinning, and moderation (report, block, take back; the moderators' side for `admin.py`). Routes: `r_chat.py`.
Tables: `chats`, `chat_members`, `chat_messages`, `chat_reports` (`migrations/0009_chat.sql`). The app side
is `mobile/src/app/(tabs)/chat.tsx` (list) and `mobile/src/app/chat/[id].tsx` (a conversation).

Who sees what, the rules everything here keeps:

- a **one-to-one** chat only while the two are friends (`_visible`): unfriending or blocking hides it for both,
  becoming friends again brings it back with its history. One per pair (`direct_key`, unique).
- a **group**: whoever is in it (`chat_members`); anyone in it adds their own friends, anyone can leave, the last
  one out deletes it.
- messages from someone **you blocked** are gone for you only (`_not_blocked`), in groups too, also from the
  unread count and the preview. They don't notice.
- **events** (`kind='event'`, no writer) carry a payload and the names it mentions as they were then; the app
  writes the sentence (`mobile/src/lib/chat.ts` `eventText`). Types: created, added, left, renamed,
  break_planned.

Push: the **bell** per chat (`chat_members.push`, only for you, off by default; `edit`). `send` queues
`push.py`'s `push_chat` job, which sends the message to everyone with the bell on (and not to who blocked the writer).

## `MAX_BODY`, `MAX_GROUP`, `MAX_NAME`, `PAGE`, `REASONS`

1000 characters a message, 30 people a group (you included), 40 characters a group name, 50 messages a page, the
report reasons (spam, mean, unsafe, other; also an ENUM in the table).

## `direct_key`, `clean_body`, `clean_name`

Pure parts: the pair key (`'3:9'`), a message as stored (trimmed, trailing spaces per line gone, at most one empty
line in a row, None when empty: `chat_empty`), a group name (spaces collapsed; empty is `chat_name`).

## `list_for`

The chat list: your chats you can see, each with the newest message you can see, your unread count (text from
others, not deleted, not from people you blocked) and the others in it; pinned first, then newest message first.
`unread` in total for the tab badge. A handful of queries for any number of chats.

## `chat_out`

One chat for the conversation screen: everyone in it (`me`, `friend`: still your friend) and how far each of
them read (`last_read_id`: the app shows "gelezen" / "gelezen door 2").

## `messages`

Oldest first: the newest page, the page above `before`, or what's newer than `after`. `more`: older ones exist.

## `_load`

The chat, its members and your membership, or 404 `chat_gone` (not in it, or not friends any more). Every read
and write goes through it.

## `open_direct`

The one-to-one chat with a friend, made the first time (`INSERT IGNORE` on the unique key: two phones opening it
at once get the same chat). Not friends or blocked: 404 `not_friends`.

## `create_group`, `add_members`, `leave`, `edit`

Groups: only your own friends go in (`_check_friends`), 30 at most (`chat_full`). Someone added starts with
everything before read (no unread pile). Leaving or renaming leaves an event; renaming or leaving a one-to-one
chat is `chat_direct`. `edit` also pins and turns the bell on or off (both only for you).

## `send`

A message from you (inside the route's transaction, the chat row locked so `last_message_id` stays right); what
you send counts as read, and a `push_chat` job is queued in the same transaction (`push.py`). Retries on bad wifi are
caught by the Idempotency-Key (`idempotency.py`), not here.

## `take_back`

Your own message, gone for everyone: `deleted_at` set and the text emptied (the app shows "Bericht verwijderd").

## `mark_read`

Read up to a message, never past the newest one and never backwards.

## `report`

"Meld dit bericht": a text message of someone else in a chat you can see (else `chat_report_own` /
`chat_message_gone`). Stores what was written (`snapshot`, kept when the message is removed later), once per
reporter (`INSERT IGNORE`). `block` also blocks the writer (`friends.block`). The writer is never told.

## `post_event`

An event in every chat all these people are in (their one-to-one chat and the groups they share). Called by
`breaks.respond` when someone says yes: "Lotte en Amir pakken samen pauze om 12:30".

## `delete_user`

Account deletion (`accounts.delete_user`): their one-to-one chats, their messages, their place in groups (groups
left empty go too), reports by and about them.

## `reports`, `resolve`

The moderators' side (`admin.py` `/admin/v1/reports`): reports with who, why, the text, the message's state now
(visible, deleted, removed, gone) and the three messages before it; `resolve` dismisses, removes the message
(`removed`: "Verwijderd door een moderator"), or removes it and turns the writer's account off (signed out
everywhere). Every open report about the same message closes with it.

## `message_out`, `_ts`, `_person`, `_friend_ids`, `_members`, `_not_blocked`, `_visible`, `_summary`, `_add_event`, `_names`, `_check_friends`, `_drop_chats`

Helpers. `_not_blocked` leaves the filter out when you blocked nobody: `NOT IN (NULL)` would match nothing.
`_ts`: UTC with milliseconds and a Z.
