---
updated: 2026-10-24T03:30:00Z
---

**Pages of the Rooster tab** as pure functions on local dates. Time is split into segments, the school
week (Mon–Fri) and the weekend (Sat–Sun); a page is 1–`MAX_DAYS` days inside one segment, on a grid from
the segment's start (with 2 days: Mon–Tue, Wed–Thu, Fri), the same going back as going forward.

## `Page`, `MAX_DAYS`

A page: its first day and how many days. At most 5.

## `page`, `pageDays`, `samePage`

A page from a day with up to n days (cut at the end of the segment), its days, and comparing two.

## `nextPage`, `prevPage`

One page on (after Friday: the weekend) or back.

## `bigNext`, `bigPrev`

A big swipe: like next/prev, but past the weekend.

## `pageWith`, `homePage`

The page with a given day on it, and where the tab opens (today; at the weekend the coming school week).

## `weekday`, `isWeekend`, `segment`, `daysBetween`

Helpers: Monday = 0, the segment of a day, whole days between two dates.
