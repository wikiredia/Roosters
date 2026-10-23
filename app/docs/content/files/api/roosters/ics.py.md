---
updated: 2026-10-23T17:30:00Z
---

**iCalendar (.ics)** links from Google, iCloud, Outlook or WebUntis iCal, turned into lessons.

- Recurring events are expanded (`recurring_ical_events`), from yesterday until 3 weeks ahead, with at most
  3000 events.
- All-day events are skipped (they aren't lessons); events over midnight are split per day.
- Optional **keywords**: keep only events whose title contains one (e.g. a personal calendar where only
  'lesson' events count).
- **Data minimisation:** title, times, location and cancelled status only. No organiser, description or links.

## `IcsError`

Not a calendar, or the recurring events can't be read.

## `MAX_EVENTS`, `DAYS_BACK`, `DAYS_AHEAD`

Limits: at most 3000 events, from 1 day back to 21 days ahead.

## `_local`

A datetime in the school's timezone; None for all-day dates.

## `_text`

Trimmed text, cut to a maximum length, or None.

## `parse`

The whole conversion described above. The uid is a hash of the event's UID, start and day, so it stays stable between fetches (needed for change detection).
