---
updated: 2026-10-24T13:40:00Z
---

**Pinned friends**: the few friends you want on top wherever friends are listed (the friends list, Today's board,
Vergelijken's suggestions). Set with `PATCH /api/v1/friends/{id}` `{pinned}` (`r_friends.edit_friend`).

## `friendships (alter at line 5)`

`pinned`: on **your** row of the friendship (`user_id` = you, `friend_id` = them), like `chat_members.pinned` for
chats, so a pin is only yours: the friend never learns it (`friends.set_pinned` touches only that row, and nothing a
friend can ask reads it). It goes with the friendship: unfriending and blocking (`friends.disconnect`) and account
deletion (`accounts.delete_user`) delete the row, so becoming friends again starts unpinned. In the export as
`friends[].pinned`. No cap.
