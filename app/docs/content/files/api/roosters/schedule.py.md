---
updated: 2026-10-24T05:00:00Z
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

## `ensure_weeks`

Weeks outside the routine sync (`sync.synced_weeks`) are fetched from Untis when someone looks at them, up
to `WEEKS_MAX_DISTANCE` weeks away. Per followed class and week (`class_weeks`): never fetched → queued and
the answer says `loading` (the app shows a skeleton and asks again); a future week older than
`WEEK_STALE_HOURS` or a past week fetched before it was over → refreshed in the background; Untis said no
→ tried again after an hour. Called by `/me/schedule`, `/me/today` and a friend's schedule.

## `ensure_class_weeks`, `outside_mondays`

The same for classes directly (a class's own timetable in onboarding, `r_schools.class_lessons`), and the
Mondays of a range the routine sync doesn't cover.

## `lessons`

All lessons of several people between two days: classes (filtered per source with include/exclude and hidden courses, and for a source of one semester only on that semester's days, `terms.covers` with the school's dates) and personal calendars, sorted, with duplicates removed (two sources with the same lesson).

## `local_now`

Now, in the user's school timezone.

## `person_days`

A `logic.PersonDay` per user for one day: lessons that take place, campus, today's check-in.

## `status`

The now-board line as **codes** (in_class, later, break, chilling, wants_to_chill, done, no_classes, absent, home) with times; the app writes the sentence.
