---
updated: 2026-10-30T13:30:00Z
---

**Who may see whom.** A friendship is mutual (two rows in `friendships`). Each side chooses what the other
sees (`full` timetable or `freebusy`) and may pin the other (only for itself), ghost mode hides you for a while, and blocking ends everything (in chat too: `chat.py` hides what someone you blocked writes).

Used by `r_friends.py` and by Today (`r_me.today`). Any feature that shows one person's data to another
should go through `visible_friends` / `friendship`, so ghost mode and visibility apply.

## `blocked_between`

Did either of us block the other?

## `connect`

Makes two people friends inside a transaction: not with yourself, not when blocked, not over the limit. Closes open requests between them.

## `count`

How many friends someone has (limit `config.MAX_FRIENDS`).

## `disconnect`

Ends a friendship both ways (unfriending, and blocking via `block`), and cancels open access requests between the
two (`access.py`), so becoming friends again starts clean. Break requests and request cards are hidden while
they're not friends (`breaks._out`, `access.cards`).

## `friend_out`

A friend for the app, with `pinned` (whether **I** pinned them).

## `set_pinned`

Pins a friend (or not) on **my** row of the friendship (`friendships.pinned` where `user_id` = me), inside the
caller's transaction. The other row is never touched, so they can't tell. The pin goes with the row: `disconnect`
(unfriending, blocking) and account deletion remove it, so becoming friends again starts unpinned.

## `friendship`, `visible_friends_of`

What one or some specific people show me, or None/nothing when we're not friends.

## `visible_friends`

My friends with what each shows **me** (`visibility`), what I show them (`my_visibility`), whether I pinned them
(`pinned`, from my own row) and whether they're hidden right now (ghost mode). Sorted pinned first, then by name:
the friends list, Today and everything built on it keep that order.

## `block`, `blocked_by`

`a` blocks `b` inside a transaction: the block row, the friendship ended, open requests cancelled; `b` isn't told.
Used by `r_friends.block` and by reporting a chat message with 'block too' (`chat.report`). `blocked_by`: everyone
someone blocked (the chat leaves their messages out).

## `may_see_photo`

Who sees your photo: you, your friends, people in a chat with you and friend requests either way: everyone who sees
your name. Never across a block.
