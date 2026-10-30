---
updated: 2026-10-30T15:07:00Z
---

Break requests: the pure parts (who can't when, the state of a request, flipping who walks, no asking twice) and the
whole flow through the API: asking and saying yes (both sides see it, also on Today, with notifications), no
asking twice from either side, busy people and bad times refused with who and why, only friends and no guests,
another time and taking it back, unfriending or deleting an account making requests disappear, "Ik ben bezig"
in the breaks (reason `busy`), and the cards in the chat: in the direct chat (with `chats` in the answer and `chat`
in the notifications, also for the counter and taking it back), or once in the group that is exactly the people
asked (where a card shows nothing to someone who isn't friends with the asker any more). Whether a card can still
happen (`school_change`/`school_week` pure; through the chat: an extra lesson → `new_lesson`, changed → `moved`, a
normal one or "Ik ben bezig" → not possible without reason, the ETag changing, declined → possible again), and
`GET /breaks/usual` (count, order, cancelled/declined/too old not counting, pinned fill-up only below 3).

## `_lesson`

Puts a lesson with a given state in a class on `DAY` (its own uid, next to `add_class_lessons`' ones).

## `_past`

A request in the past straight in the database (an answer, optionally cancelled) for the `usual` test.

## `DAY`, `_setup`, `_ask`

Tomorrow (never "already over"), Reda and Kayra with lessons and a shared break 10:30–12:00, and a helper to ask.

## `H`, `info`, `E`

Minutes per hour, a `DayInfo` from lessons in hours, and an existing request for `already_asked`.
