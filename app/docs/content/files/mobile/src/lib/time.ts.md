---
updated: 2026-10-23T17:30:00Z
---

Dates and times in the app. Times are **minutes since midnight** (as in the API); dates are local `YYYY-MM-DD` strings. Formatting uses nl-BE or en-GB.

## `hhmm`, `range`

Minutes → '09:30' (always 24 h); a start–end range.

## `isoDay`, `parseDay`, `addDays`, `monday`, `nowMin`

Local date helpers (no timezone surprises: dates are built from parts, not parsed as UTC).

## `longDate`, `shortDate`, `weekdayShort`, `monthRange`

'Dinsdag 20 oktober', 'di 20 okt', 'Di', '19 – 23 oktober'.

## `minutesAgo`

For 'Updated 4 min ago'.
