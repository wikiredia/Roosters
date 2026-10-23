---
updated: 2026-10-23T17:30:00Z
---

**Reading timetables**: someone's lessons from the classes they follow and their own calendar links,
filtered by their course choices, and turned into the `PersonDay` objects the break logic works with.
Used by Today, the week view, a friend's timetable and Compare.

## `OFF`

Lesson states that don't make you busy (cancelled, removed).

## `RECENT`

How long a change stays marked as 'new' in the app (48 hours).

## `busy_only`

Free/busy view: merged busy blocks per day, nothing about what or where.

## `lesson_out`

One lesson for the app. Without detail (a friend who shares only free/busy) it says only when.

## `lessons`

All lessons of several people between two days: classes (filtered per source with include/exclude and hidden courses) and personal calendars, sorted, with duplicates removed (two sources with the same lesson).

## `local_now`

Now, in the user's school timezone.

## `person_days`

A `logic.PersonDay` per user for one day: lessons that take place, campus, today's check-in.

## `status`

The now-board line as **codes** (in_class, later, break, chilling, wants_to_chill, done, no_classes, absent, home) with times; the app writes the sentence.
