---
updated: 2026-10-30T13:00:00Z
---

The **week strip** above the timetable: seven equal cells. What you see in the grid is a white cell (the first day)
with a grey band stretching out of it; the dash on the band's edge sets how many days you see (1–7), **live**: the
grid's columns get thinner or wider with your finger (they share `count`), a little sticky at every whole day
(`magnet` from `lib/haptics.ts`, a `tick()` each time the rounded number changes) and settle with a bounce (`snap()`).
Drag the dash **left past the white cell** and the view becomes one day that follows your finger back in time
(sticky per day too): the white cell slides left (at the strip's edge the dates slide right under it), the grid shows
the days before; on release it settles on a whole day and `onResizeEnd` gets that day as the new start.

The white cell, the band and the dash are **one group you can pick up** (`move`, on the band's body): it lifts a
little and follows your finger **across and up or down**. Across, over the dates, which stay put (`offset` moves
with `k`), the grid shows the days under it, live; the live day is bent towards whole days with `magnet` so it feels
per day, but only softly (you can still follow the grid moving). Up and down it's held to the row by a rubber band
(`rubber`, never more than `LIFT` × `H`) and springs back on release. It never leaves the strip: **push it against
the strip's edge** and the dates scroll further in time under it, every frame (`useFrameCallback`; faster the
further you push, `EDGE`, `SCROLL_MIN`, `SCROLL_MAX`), and `onMove` tells the screen which days to load. Let go and
it settles on a whole day (`onTarget`, `snap()` once the spring lands; the screen then springs `k` so the strip sits
on the week again).

**Swiping the dates themselves** (`swipe`, on the strip, not on the group) is a carousel: the dates follow the
finger, the group keeps its cell (`k`), so `offset` moves with the dates, the same as a swipe on the grid. On release
a flick goes a few days further (never more than a week) and it settles on a whole day: `onTarget` right away
(the screen springs `k` back onto the week, as after a grid swipe), `onMove` for every day passed while dragging,
`snap()` when the spring lands.

**Week drag** (`weekDrag`, an A/B test that `Calendar` passes from a setting): pulling the picked-up group down
shows the week after **below** the row (pulling up: the week before, above), half see-through (`GHOST`), fading in
from `GHOST_FROM` × `H`. At `WEEK_AT` × `H` of drag the row scrolls a week: `offset` ± 7 (`onMove`, and `onTarget` on
release), the rows jump one row so nothing moves on screen and then slide on (`wy` springs to 0): the new week comes
in from outside (pulling down, the dates below come up), the old one slides out and fades (`fade`; `carry` keeps the incoming one visible for that moment).
Each further `WEEK_AT` × `H` goes another week; pulling back undoes it. Off, up and down only follows the rubber band
and never changes the week. The rows above and below are only rendered with `weekDrag`.

**Haptics**: a `tick()` for every whole day the first day passes while one of the strip's gestures moves it
(`useAnimatedReaction` on `Math.round(offset)`, only while `ticking`: grid swipes and the screen's own springs
don't tick here), so also per day scrolled at the edge, per week changed and per day a swipe's spring passes; the
count ticks at the `last`/`onResize` spot. `snap()` when it's let go and lands. Never per frame.

**Gestures**: the strip's detector has `Gesture.Race(swipe, tap)`; `move` (on the body) blocks `swipe` and `tap`, so a
touch that starts on the group picks it up; `pan` (the dash) blocks all three. Taps go through the gesture system
(not a Pressable per day), so a swipe never ends as a tap: tap a day to start there.

**Layout**: the strip itself is **not clipped** (the lifted group and the weeks above and below hang over the grid;
`Calendar` puts the strip's wrapper above the grid with `zIndex`/`elevation`). The dates are clipped to the strip's
width in their own layer, `H` above to `H` below the row (`pointerEvents="none"`: touches go to the strip). While
the dash is dragged a **faint dash** (`target`, 45 % opaque) shows where it will settle: whole days, so it jumps from
day to day ahead of your finger (the same rounding as `onFinalize`).

Under each date a small **dot per kind** of lesson that day (`Timetable.kindsOf`, `KIND_DOT`: theory blue, lab green,
…; cancelled lessons don't count); today is the blue number. For screen readers every day of the strip's own row is a
button (the weeks above and below are hidden from them) and the dash an 'adjustable' control.

## `DayStrip`, `Props`

As above. Memo, and its gestures (`tap`, `swipe`, `move`, `pan`) are made once and again only when its size (or
`weekDrag`) changes: give it callbacks that keep their identity and the `kinds` Map (`Calendar` does), so it renders
when its days or width change, not with a swipe or a sheet.
`onResize` fires every time the dash covers another number of days, `onResizeEnd` when it's let go (with
the new first day when you pulled it back, else `undefined`); `kinds.get(day)` gives the dots, `onTarget` where the
group was let go or a swipe of the dates settles, `onMove` the first day while the dates scroll (at the edge, a week
change, a swipe); `nudge` makes the dash wiggle (first-time tip); `weekDrag` turns on the week drag. `n` is the number
of days as React knows it, for the screen reader label and the adjustable action: render never reads the shared
`count` (Reanimated warns about that).

**Date rows** (`DateRow`, inside the file) are placed from a day kept from the first render (`left = (day - base) * cell`,
`base` in the component); only shared values move them (`translateX` from `offset - k`, ± 7 for the rows above and
below; `translateY` from `wy`). They used to be placed from `from`, which changes with every swipe; React moved the
cells in one frame and the UI thread slid them a frame later, so for a moment the strip showed other weekdays and
dates. With `weekDrag` each row renders a week more to the left (`from - 7`), because a week change goes back 7 days
in one frame, before the screen has rendered the new `from`.

## `H`, `EDGE`, `SCROLL_MIN`, `SCROLL_MAX`, `LIFT`, `GHOST_FROM`, `WEEK_AT`, `GHOST`, `NO_DOTS`

The strip's height; how far (cells) the group must be pushed past the edge before the dates scroll, and the
scrolling speed there (days per second, from calm to fast); how far (× `H`) the group goes up or down at most; with
`weekDrag`, from how far (× `H`) the week above or below shows and at how far it changes, and how opaque it gets;
and the one empty list of dots a day without lessons uses.

## `rubber`, `fade`

Worklets: the rubber band that holds the group to the row (1:1 at first, never past its cap), and a row's opacity
at a height (full on the row, gone a row away, `GHOST` on the side being pulled into view).
