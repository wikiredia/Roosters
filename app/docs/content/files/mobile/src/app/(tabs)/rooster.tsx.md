---
updated: 2026-10-24T14:00:00Z
---

**Rooster**: your days side by side (1–7), one continuous strip you scroll through day by day, as far back or
ahead as you like (no pages). The week strip on top (`DayStrip`), the grid's columns (`DayGrid`) and their widths
share the same animated values (`offset`: the left edge in days, `count`: how many days, `k`: where that first day
sits in the strip), so everything moves together in the same frame, on the UI thread.

- **Swiping**: day by day with a little momentum (`lib/days.snap`); an empty weekend is calm (short swipe shows it,
  a bit further lands on Monday). Where a swipe lands is known as the finger lets go: dates and data switch then,
  not after the animation. Only the columns wait for data; new lessons slide in from the side you came from.
- **How many days**: drag the dash on the strip (live, the columns thin out while the next days slide in), pinch the
  grid, or − / + (shown until you've used the dash on your own: `days.learned`). Remembered (`rooster.days`); without
  a choice 5, or 7 when this week's weekend has something on it.
- **Zoom**: double tap stretches the hours to your first and last lesson of the visible days; double tap again or
  the small magnifier over the hours shows everything. Every visit starts zoomed out.
- **Vandaag** (`TodayPill`) floats over the grid when you've moved away; drag it to any corner.
- **Tips**: the dash first (`hint.days`), then double tap / pinch once you've learned the dash (`hint.zoom`).
- The eyebrow ('26 – 30 okt') is one short line; the legend one line that scrolls sideways (only what's on screen),
  so nothing pushes the grid around.

Busy weekends go to the grid's swipe (a shared value, set in an effect) and to `homeStart` from a plain array
computed with the data: render never reads a shared value.

Data: whole weeks with shared breaks (`useWeeks`, `GET /me/schedule?together=1`), three or four weeks around what
you see. Tapping a lesson opens `LessonSheet` with that day's shared breaks.

## `RoosterScreen`

The tab, as above.

## `Tip`

A small dark tip with 'Oké', over the content but never the whole screen.

## `rangeLabel`, `HOURS`, `AXIS_W`

'19 – 23 okt' / '28 okt – 3 nov' / 'di 20 okt'; 08–18 always on screen (stretched by earlier or later lessons); the
width of the hours on the left.
