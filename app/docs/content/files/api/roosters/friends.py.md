---
updated: 2026-10-24T10:30:00Z
---

**Who may see whom.** A friendship is mutual (two rows in `friendships`). Each side chooses what the other
sees (`full` timetable or `freebusy`), ghost mode hides you for a while, and blocking ends everything (in chat too: `chat.py` hides what someone you blocked writes).

Used by `r_friends.py` and by Today (`r_me.today`). Any feature that shows one person's data to another
should go through `visible_friends` / `friendship`, so ghost mode and visibility apply.

## `blocked_between`

Did either of us block the other?

## `connect`

Makes two people friends inside a transaction: not with yourself, not when blocked, not over the limit. Closes open requests between them.

## `count`

How many friends someone has (limit `config.MAX_FRIENDS`).

## `disconnect`

Ends a friendship both ways.

## `friend_out`

A friend for the app.

## `friendship`, `visible_friends_of`

What one or some specific people show me, or None/nothing when we're not friends.

## `visible_friends`

My friends with what each shows **me** (`visibility`), what I show them (`my_visibility`) and whether they're hidden right now (ghost mode).

## `block`, `blocked_by`

`a` blocks `b` inside a transaction: the block row, the friendship ended, open requests cancelled; `b` isn't told.
Used by `r_friends.block` and by reporting a chat message with 'block too' (`chat.report`). `blocked_by`: everyone
someone blocked (the chat leaves their messages out).

## `may_see_photo`

Who sees your photo: you, your friends, people in a chat with you and friend requests either way: everyone who sees
your name. Never across a block.
