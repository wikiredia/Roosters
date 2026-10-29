---
updated: 2026-10-30T02:00:00Z
---

The **days side by side** as one continuous strip of columns. Every column is placed on the UI thread from the shared
`offset` and `count`: moved with a **transform** (`translateX = (day - offset) × width/count`, `left: 0`) and sized with
`width = width/count`, two animated styles. A swipe changes only the transform (Reanimated's fast path, no layout pass);
the width changes only while the number of days does (pinch, the strip's handle). Swiping, pinching and the handle move
all columns in the same frame.

**Which columns exist** (`mounted`): the days in view (`start`, `want`, as React has them) plus `ceil(want)` days on each
side, not the whole data window. The data window (`from`…`to`, the weeks `Calendar` fetches) is wider, so a column that
mounts has its data already. A gesture that moves further than the buffer (a pinch to 7 days, the strip pushed against
its edge) adds columns as it crosses each whole day: an animated reaction on `offset`/`count` calls `extend` through
`scheduleOnRN` when the days on screen (± 1) leave the mounted range (`live`). When React's view moves, the window
follows it again and `live` is dropped. Mounting one column is cheap (the columns are memo and get only stable props).

Gestures (Gesture Handler, all on the grid): `Simultaneous(pinch, Exclusive(skip, pan, Simultaneous(doubleTap, tap)))`.
- **pan**: follows the finger; on release `days.snap` decides where it lands and `onTarget` tells the screen right
  away (dates and data update before the spring ends), then it springs there (`SWIPE`: calm, no bouncing through days);
- **pinch**: more or fewer days, the day under your fingers stays put; settles on whole days;
- **double tap**: `onDoubleTap` (the screen zooms the hours), within `DOUBLE_TAP_DELAY` of the first tap;
- **tap**: runs **side by side with the double tap**, it doesn't wait for it to fail. Its `onEnd` worklet looks up what's
  under the finger (`TapTargets.tapKindAt`); on something that opens a sheet it starts that sheet's **peek** on the UI
  thread in the frame the finger lifts (`Sheet.peekSheet` on one of `peeks`), then tells JS (`tapAt`) what to put in it.
  A tap on nothing never wakes JS. See **The peek** below. Taps go through the gesture system instead of a Pressable per
  lesson, so a swipe or a pinch never ends as a tap on the lesson it lets go of. Blocks are still buttons for screen
  readers (`onAccessibilityTap`), which open their sheet fully at once: there is no double tap for them.

The gestures are `useMemo`'d (Reanimated's advice), so they are made again only when the width, the hours or a callback
change; the callbacks from `Calendar` and `tapAt` (`useStable`) therefore have to keep their identity. The coordinate math
of the tap, the pinch anchor and `SkipDrag.useSkipGesture` reads `offset`/`count`/`width` only, so it doesn't care how the
columns are placed.

**The peek.** A single tap can't know for `DOUBLE_TAP_DELAY` (200 ms) that it isn't the first of two, so it's answered at
once with a peek and the double tap still works everywhere:
- tap ends on a lesson / overlap / shared break / skipped class → that sheet slides up `Sheet.PEEK_PX` (no scrim, no
  touches: a second tap anywhere reaches the grid), and `tapAt` → `onPressLesson`/`onPressOverlap`/`onPressTogether` with
  `peek = true` fills it (it may be a frame late: the empty chrome shows for that frame);
- a second tap within the window: the double tap ends, all peeks slide back down (`dropPeek`), `onDoubleTap` zooms and
  `Calendar` forgets the pending sheet. That second touch is never a tap of its own (`second`: it came down while the
  double tap was still waiting, `pending`);
- no second tap: the double tap fails when its window runs out (`onFinalize`), the peeking sheet goes on to open fully in
  one motion (`openPeek`) and `onPeekOpen` tells `Calendar`, which makes it `visible` (scrim, touches);
- the double tap already gave up before the tap ended (a long press, `waiting` false): the sheet opens fully at once;
- the UI thread thought something was there but `tapAt` finds nothing (the data just changed): `onPressNothing`.

**Lines**: hours across, a line between days, subtle dots (react-native-svg), in two drawings for the whole grid
instead of one per column. The **hour lines** are drawn for all 25 hours, placed for React's hours and moved/scaled to the
hours on screen (`zoom`) while they glide; clipped to the hours area. The **day separators** are dotted lines a column
apart (React's width) that move by the part of a column you've swiped (they repeat every column); while the number of
days changes they fade out and come back when it settles.

A day still loading shows a skeleton and its lessons **fade in from the side you came from when they arrive while that
day is in view**; a column that mounts with its data, or gets it out of sight, shows them as they are. There are **no
layout transitions on the blocks** (a layout animation per block restarted a 200 ms animation for every block on every
frame of a pinch). When the hours change (zoom, a swipe to days with earlier lessons) the blocks of the days in view
**glide** with them (`GridZoom`, `Placed`); the others jump. Today has the 'now' line. Free moments between lessons
(`Timetable.freeGaps`) are light grey with a small coffee cup, drawn behind everything: a shared break or a cancelled
lesson goes over them. They aren't tappable (screen readers read 'Vrij, 10:00 tot 11:00').

## `DayGrid`, `Props`, `GridView`

Overlapping lessons get an `OverlapBand` over the shared stretch. A tap there (or within 10 minutes of it,
`Timetable.lessonsAt`) calls `onPressOverlap` with those lessons instead of opening one.

As above. `data(day)` gives a day's `DayData` (`DayCache`: everything is worked out already). `GridView`: the store
`Calendar` keeps with the direction you went and where you are, read (never rendered with) by the columns.

With `drag` a class of yours can be picked up and dropped into the bin to skip it: the gesture is
`SkipDrag.useSkipGesture`, first in the gesture tree (the swipe and taps wait until it fails, which is at once
when the finger isn't on a draggable class). A tap on a skipped class opens it, unless a shared break is over it.

Memoised: give it stable callbacks (`Calendar` does), so opening a sheet doesn't re-render every column. A tap on a
hatched (`muted`) shared break does nothing, and for today that includes the ones that ended before `nowMin`.

## `GridPeeks`

The three sheets a grid tap opens (`lesson`: a lesson or a skipped class; `overlap`; `ask`: a shared break), each a
`Sheet.SheetPeek` that `Calendar` makes with `useSheetPeek` and hands to the sheet and to the grid.

## `GridZoom`

The hours **as they are on screen**, on the UI thread: `h0` (first hour) and `pph` (pixels per hour), plus `range`, the days
in view (first, last). `Calendar` animates `h0`/`pph` to React's new hours in 250 ms when the hours change, and sets them
directly when only the size does. While they glide, `Placed` blocks of the days in `range` (at most 7 columns of a few
blocks) take their `top`/`height` from them, and so do the hour lines and `Timetable.TimeAxis`, so the axis moves with the
blocks instead of jumping after them. `range` is kept up to date on every move, so a double tap's first frame already
knows which days glide.

## `ColumnProps`

One day's column (`DayColumn`), placed from the shared values. It gets its props **explicitly** (not the grid's `{...p}`) and only
numbers, strings, shared values, `DayData` objects and callbacks that keep their identity, so a swipe does not render it:
`hours` is the same array while its two numbers are, `nowMin` is `null` on every day but today (today's column is the only
one that re-renders each minute), and the direction comes from the `view` store when its data arrives. `past` lessons and
today's shared breaks that are over are worked out here from `nowMin`, not in the cache. `noteColumnRender` counts each
render for the fps overlay.

Every block (free, lesson, shared break, overlap band, the 'now' line) is a `Placed`: at `top`/`h` for React's hours, and
while the hours glide, placed from `GridZoom` if its day is in `range`. Its animated style depends only on the zoom's
values, so it never runs during a swipe.

## `LABEL_H`, `SWIPE`, `RESIZE`, `DOUBLE_TAP_DELAY`

The date row above the columns; the spring of a swipe; the spring the number of days settles with; how long after a tap a
second one still makes a double tap. `DOUBLE_TAP_DELAY` also decides when a peeking sheet opens fully: lower opens sooner,
too low makes double taps hard. Tune it by feel with the user (with `Sheet.PEEK_PX` and the peek's speed).
