---
updated: 2026-10-30T02:00:00Z
---

The **week strip** above the timetable: seven equal cells. What you see in the grid is a white cell (the first day)
with a grey band stretching out of it; the dash on the band's edge sets how many days you see (1–7), **live**: the
grid's columns get thinner or wider with your finger (they share `count`) and settle with a bounce. Drag the dash
**left past the white cell** and the view becomes one day that follows your finger back in time: the white cell slides
left (at the strip's edge the dates slide right under it), the grid shows the days before; on release it settles on a
whole day and `onResizeEnd` gets that day as the new start.

The white cell, the band and the dash are **one group you can pick up** (`move`, on the band's body): it lifts a
little and follows your finger over the dates, which stay put (`offset` moves with `k`), and the grid shows the days
under it, live. **Push it against the strip's edge** and the dates scroll further in time under it, every frame
(`useFrameCallback`; faster the further you push, `EDGE`, `SCROLL_MIN`, `SCROLL_MAX`), and `onMove` tells the screen
which days to load (the grid adds the columns it needs as the view passes each whole day: `DayGrid` "Which columns
exist"). Let go and it settles on a whole day (`onTarget`; the screen then springs `k` so the strip sits on
the week again). Swiping the dates themselves does nothing: the grid's swipe moves the dates under the band (the strip
shows `offset - k` …). When the band grows past Sunday the dates slide left under it. The dash's drag blocks moving
the group and a tap.

Taps go through the gesture system (not a Pressable per day), so a swipe never ends as a tap: tap a day to start
there. Under each date a small **dot per kind** of lesson that day (`Timetable.kindsOf`, `KIND_DOT`: theory blue, lab
green, …; cancelled lessons don't count); today is the blue number. For screen readers every day is a button and the
dash an 'adjustable' control.

## `DayStrip`, `Props`

As above. Memo, and its three gestures (`tap`, `move`, `pan`) are made once and again only when its size changes: give it
callbacks that keep their identity and the `kinds` Map (`Calendar` does), so it renders when its days or width change, not with a swipe or a sheet.
`onResize` fires every time the dash covers another number of days, `onResizeEnd` when it's let go (with
the new first day when you pulled it back, else `undefined`); `kinds.get(day)` gives the dots, `onTarget` where the
group was let go, `onMove` the first day while it scrolls at the edge;
`nudge` makes the dash wiggle (first-time tip). `n` is the number of days as React knows it, for the
screen reader label and the adjustable action: render never reads the shared `count` (Reanimated warns about that).

## `H`, `EDGE`, `SCROLL_MIN`, `SCROLL_MAX`, `NO_DOTS`

The strip's height; how far (cells) the group must be pushed past the edge before the dates scroll, and the
scrolling speed there (days per second, from calm to fast); and the one empty list of dots a day without lessons uses.
