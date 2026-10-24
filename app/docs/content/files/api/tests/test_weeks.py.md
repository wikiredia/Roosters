---
updated: 2026-10-24T02:00:00Z
---

Any week: a week far ahead is fetched when you look at it (`loading` first, then the lessons, and only once);
a past week is fetched and kept (Today for that day); weeks the routine sync covers are never fetched separately.

## `_fake_weeks`

A fake `untis.fetch_week` (one lesson on the Tuesday of every week); also marks the course scans done so they
don't use it.
