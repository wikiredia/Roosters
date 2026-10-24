---
updated: 2026-10-24T02:00:00Z
---

Fourth migration: **any week, past or future**. The routine sync keeps only this week and the next few fresh;
other weeks are fetched when someone looks at them (`sync.fetch_class_week`).

## `class_weeks`

One row per class and week (its Monday): when it was fetched and the error if Untis said no. Read by
`schedule.ensure_weeks` to decide what to fetch; the lessons themselves go into `class_lessons`.
