---
updated: 2026-10-31T20:17:00Z
---

**Dragging a class into the bin to skip it.** The gesture lives in `DayGrid` (first in its gesture tree, so the swipe
through the days and the taps wait for it to fail); what you see lives in `Calendar` over the grid (`DragLayer`).
They share one `SkipDrag` of shared values, so the card follows the finger on the UI thread without a React render.

Watch out: the hard part is telling a drag apart from a swipe through the days and from a tap. Change `HOLD` or the
direction rule in `useSkipGesture` and test both on a phone.

The gesture is `useMemo`'d (made again only when the grid's size, hours or the callbacks change), so `onPick` and `onDrop`
must keep their identity, and `useSkipDrag` returns one object for the life of the component for the same reason (a new
object on every render used to defeat `DayGrid`'s memo). `enabled: false` makes the gesture fail at once.

## `useSkipGesture`, `GestureProps`

A pan with manual activation. Touch down: is there a draggable class under the finger (`DragTarget`s, hit-tested on
the UI thread)? No: fail at once. Yes: get the card ready (`onPick`) and lift it after `LIFT_AFTER` if the finger
stays still. Then the first 6 px of movement decide: rested `HOLD` ms, or more up/down than sideways → pick it up;
quick and sideways → fail (it's a swipe through the days). **Mostly classes in view** (`coverage` over `COVER_MAX`, 0.5:
more than half of the grid you see is classes you can pick up, so there's hardly room left to put a finger down to
scroll or swipe): a class is only picked up after holding it still `HOLD_LONG` ms (it lifts at that moment, with a
light tap), and moving before that fails the gesture, so a swipe or scroll starting on a class works. Fewer classes:
instant, as described above. The mode is chosen at touch down. The bin is on the **half opposite where the finger came down**
(`drag.side`: a class on the right half → the bin on the left, otherwise on the right), so the card never has to cross
the screen. Let go over the bin, or throw it towards it faster than `THROW_V` → it flies into the bin and `onDrop` skips it; anywhere else it springs back. While dragging, the card
swings with the finger's speed (smoothed) around the point you hold it, and tilts a little over the bin. Haptics
(`lib/haptics`): a light `tick` each time the card goes over the bin (tracked in `wasOver`, not the animated
`drag.over`, so once per entry), a firmer `snap` as it's dropped or thrown in; none when it springs back.

## `DragLayer`

What you see, never taking a touch: a dashed hole where the class was, the card (the lesson's own `BlockView`, a
shadow, bigger when lifted, smaller over the bin), and the bin on the side opposite the class (`drag.side`; its border, rounded corners and slide-in follow it, and it is
invisible while away so it doesn't hang over the hours on the left): a see-through zone of faint grey
diagonal lines (`Hatch`) that darkens a little when the card is over it. The bin icon and its word ('Skip', 'Let
go') sit on a fixed-width patch in the background colour, so the lines stop around them and both words (also Dutch)
fit on one line.

## `SkipDrag`, `useSkipDrag`

The shared state: `phase` (0 nothing, 1 finger resting on a class, 2 dragging, 3 flying into the bin, 4 going
back), the card's place and size (`rect`, grid coordinates), where you hold it (`grab`), and the animated
offsets, rotation, lift, over-the-bin and gone values, and `side` (1: the bin on the right, -1: on the left), set when the
finger comes down.

## `DragTarget`, `useDragTargets`

In Vergelijken a target has its lane (`x0`–`x1` of the day's width, `lane`): the hit test and the card's place use
it, and `onPick` / `onDrop` get the lane (0 = you).

The classes that can be dragged (`lib/skips.canSkip`, merged as the grid draws them), copied into a shared value
for the gesture whenever the list changes.

## `COVER_MAX`, `HOLD_LONG`, `coverage`

When the grid is mostly classes (`coverage` of the draggable ones, over the days and hours in view, a lane or side-by-side
cell counting for its share of the width, is more than `COVER_MAX`) a class needs a long press of `HOLD_LONG` ms before it
can be dragged.

## `BIN_W`, `HOLD`, `LIFT_AFTER`, `THROW_V`, `SWING`, `BACK`

The bin's width, the rest before a drag in any direction, when a still finger lifts the card, the throw speed, and
the springs for the swing and the way back.
