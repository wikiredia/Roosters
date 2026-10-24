---
updated: 2026-10-24T03:30:00Z
---

**Swiping through time**, page by page (`lib/days.ts`), with no end back or ahead. A swipe shorter than
`MIN_SWIPE` of the width (and slow) springs back; a short one goes one page (after Friday: the weekend);
longer than `BIG_SWIPE` or a flick (`FLICK` px/s) lands on the next school days, flying past the weekend.
Horizontal only: a vertical move lets the grid scroll instead.

Pages sit at **absolute positions** (`base` counts how far you've swiped), so when a swipe ends the page
you landed on is already in place with its data: nothing is rebuilt or jumps. Each side has one page ready
(two when the first is a weekend, so a big swipe can skip it). A page that appears for another reason (a tap
on the strip, 'Vandaag') fades in.

## `DayPager`, `Props`

As above. `renderPage` draws one page.

## `MIN_SWIPE`, `BIG_SWIPE`, `FLICK`

0.12 and 0.5 of the width, 900 px/s.
