---
title: Friends, breaks and privacy
position: 40
updated: 2026-10-23T17:30:00Z
---

## Becoming friends

- **Invite link** (`<PUBLIC_URL>/i/<code>`, `r_friends.my_invite`): works across schools; 30 days, 50 uses.
- **Request** to someone from **your school** (`send_request`), or from the classmates list (people in
  your classes).
- Friendship is mutual: two rows in `friendships`, one per direction.

## What a friend sees

Each side chooses per friend: the **full** timetable or **free/busy** only (`set_visibility`;
`schedule.busy_only` merges busy blocks and drops what and where). **Ghost mode** hides you completely for a
while. **Blocking** ends the friendship and is silent (the other side can't tell). Guests are invisible.

Every feature that shows one person's data to another must go through `friends.visible_friends` /
`friendship`, so these rules apply.

## Breaks together (logic.py)

- A break is time without class **between** your first and last lesson; check-ins change that (chilling
  extends it, going home cuts it, absent removes the day).
- Shared break: overlap of 30+ minutes on the same campus, 31+ on different campuses.
- Today shows your partners (`logic.partners`) and the now-board (`logic.board_status`). Compare shows
  every group of 2+ people that shares a break (`logic.compare_matches`), with up to 3 friends for free.

Tests: `api/tests/test_friends.py`, `api/tests/test_logic.py`, `api/tests/test_compare.py`.
