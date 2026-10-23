---
updated: 2026-10-23T17:30:00Z
---

**In-app notifications** (push later). Stored as `kind` + `payload`; the **app** writes the sentence in the
user's language. Today the only kind is `schedule_change` (from `sync._notify`). Each has a `dedupe` key,
so the same change is never reported twice.

## `enqueue`

Adds a notification unless one with the same dedupe key exists (returns False then).

## `list_for`

Newest first, optionally only those after an id (polling).

## `mark_read`

Marks everything up to an id as read.

## `out`

A notification for the app.
