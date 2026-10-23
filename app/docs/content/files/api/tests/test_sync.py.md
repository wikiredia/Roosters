---
updated: 2026-10-23T17:30:00Z
---

Untis sync with a recorded Untis week: parsing keeps only what the app needs; **one fetch per class** and
notifications only for people who follow the changed course; an empty answer after a full timetable
removes nothing; Untis errors are retried later and recorded on the class; `queue_due` only syncs
followed classes; a job is claimed by one worker only.

## `untis_week`, `_fake_untis`

A recorded Untis week and a monkeypatched fetch that serves it.
