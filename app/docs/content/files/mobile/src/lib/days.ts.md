---
updated: 2026-10-24T11:00:00Z
---

The Rooster tab's **days as numbers**: day 0 is a Monday long ago (`EPOCH`), so day n is n days later and n % 7 is
the weekday. What you see is a window [start, start + count); scrolling is continuous, landing is on whole days.
Pure functions (some run on the UI thread: `'worklet'`), no limit back or ahead.

## `snap`

Where a swipe lands, from how far the finger took the view and the flick's speed: day by day with a little momentum
(never more than a week). Around an **empty** weekend it's calm: from a view ending on Friday a short swipe shows
the weekend (one or two days), a bit further lands on next Monday (same backwards from Monday). A fast swipe in the
middle of the week stops at Friday (or Monday); a week view (5+ days) lands on a whole week after a big swipe. A
weekend with lessons is just more days.

## `homeStart`

Where the tab opens: the week of today (from Monday when 5+ days fit); at an empty weekend the coming week; with
fewer days, today and the days after it (never past Friday).

## `dayIndex`, `dateAt`, `weekStartOf`, `EPOCH`, `MAX_DAYS`

Date ↔ day number; the Monday of a date's week; up to 7 days at once.

## `weekdayOf`, `mondayOf`, `isWeekendIdx`

Monday = 0 … Sunday = 6; the Monday of a day's week; Saturday or Sunday.
