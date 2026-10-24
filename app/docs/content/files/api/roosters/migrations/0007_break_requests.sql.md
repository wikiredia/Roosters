---
updated: 2026-10-24T05:26:38Z
---

Seventh migration: **break requests** (`breaks.py`). One row per request in `break_requests` (who asked, which day,
from–until in minutes, how they meet, an optional place and note, `counter_of` when it answers another request with
a new time, `cancelled_at` when taken back), and one row per person asked in `break_request_members` with their
answer (`pending`, `accepted`, `declined`).

## `break_requests`

The requests. Indexed on who asked and the day.

## `break_request_members`

Who was asked and what they answered; indexed on the person, for "requests to me".
