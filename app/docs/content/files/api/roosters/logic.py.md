---
updated: 2026-10-30T13:30:00Z
---

**Breaks, shared free time, the now-board and travelling together.** Only pure functions, no database:
easy to test (`tests/test_logic.py`) and to reason about. Times are minutes since midnight.

Definitions that matter:
- A **break** is time without class **between** your first and last lesson. Before your first and after
  your last lesson you're not at school, and a day without lessons isn't free time.
- **Check-ins** change that: *chilling* / *want to chill* extends your free time after class (until a time
  or 22:00); *going home* cuts everything after that moment; *absent* means not there at all. The break part
  (`break_status`): *busy* ("Ik ben bezig") takes the breaks between classes out of your free time (no shared
  breaks, nobody can ask you then); *want_chill* ("Ik wil afspreken") only changes your board code.
- A **shared break** needs at least 30 minutes on the same campus, or more than 30 on different campuses
  (you need time to walk).

Some texts in this file are Dutch (from v1); the app gets codes and writes its own text.

## `CHILL`

The check-in statuses that mean 'still around after class'.

## `DayInfo`, `day_info`

What a day looks like for one person: present?, first and last lesson, busy blocks, free blocks (breaks, plus chilling time), when they left (going home), and `breaks_busy` (break_status 'busy': the breaks aren't in `free`).

## `LATE`

'Chilling' with no end time lasts until 22:00.

## `PING_SOON`, `PING_AFTER`

'Ask to chill' is possible from 20 minutes before a lesson ends until 60 minutes after the last lesson.

## `PersonDay`

One person on one day: id, name, lessons that take place [(start, end)], campus ids, home towns, friends, today's check-in.

## `SAME_CAMPUS_MIN`, `OTHER_CAMPUS_MIN`

Shortest shared break: 30 minutes on the same campus, 31+ on different campuses.

## `TRAVEL_MAX_DIFF`

Travelling together: first or last lesson at most 15 minutes apart.

## `also_free`

'Also free': people you know who aren't in the comparison but are free during a shared break (or during the breaks of the people you compare), with their longest window.

## `campus_windows`

Per campus: when do 2+ people have a break together (for a campus view).

## `compare_matches`

Compare: **every** group of 2+ people that shares a break, not only 'everyone at once'. A group that sits entirely inside a larger group with the same or a longer window is left out.

## `fmt`, `duration`, `names`

Formatting helpers (Dutch, from v1): 13:05, '1u30', 'A, B & C'.

## `merge`, `gaps`

Merge overlapping intervals; the gaps between busy blocks.

## `now_status`, `board_status`

One line for the now-board: in class until, break until, chilling, done, absent, home. `board_status` adds a second line and whether you can ask that person to chill (`can_ping`).

## `overlaps`

Pairwise overlaps of two interval lists.

## `pair_breaks`, `partners`

Shared breaks of two people; `partners` = everyone I share a break with today (after now), for Today's 'together' section.

## `same_campus`, `min_break`

Same campus? Then 30 minutes is enough for a shared break, otherwise more.

## `school_breaks`

Breaks between lessons only (no chilling time), cut off when someone went home.

## `travel_pairs`

Who can travel to or from school together: same home town, same campus (unless both added each other), first/last lesson within 15 minutes, and no 'never'.

## `_busy_gap`

The break between two classes you're in now if you said you're busy in your breaks: `now_status` and
`board_status` then say `pauze_bezig` (`schedule.status` → `break_busy`), can't be pinged.
