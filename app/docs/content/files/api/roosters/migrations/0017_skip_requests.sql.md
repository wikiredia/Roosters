---
updated: 2026-10-30T15:40:00Z
---

**Skip questions** ("Volg je Python?", `skipasks.py`).

## `skip_requests`

`from_id` asks `to_id` whether they'd skip what they have on `day` from `start_min` to `end_min` (the block as the
app drew it); `course`: their course(s) in it (for their push and card; the asker only gets it when they may see
courses), `minutes`: the shared break it would give, worked out when asking. `status` pending → accepted /
declined / cancelled (`decided_at`). Accepted makes `skipped_lessons` rows for `to_id`. Deleted with either
account, in the export of both.
