---
updated: 2026-10-30T02:00:00Z
---

A **bottom sheet**: scrim, grabber, a title row with a close button. The one shadow in the app.

It is **not a native `Modal`**: it renders nothing where it's used and puts what it draws into the app's `SheetHost`
(a portal, from a layout effect, so it's there before the first paint). A `Modal` cost a new view controller or dialog
window per sheet, a second gesture root and a mount before its first frame, and it takes every touch on the screen, which
rules out a sheet that peeks while the grid still gets a second tap. The host does what the `Modal` did: Android back,
hiding the app from screen readers, covering the status bar and the tab bar (see `SheetHost`). Keyboard: the sheet's own
`KeyboardAvoidingView` (`padding`, both platforms, only while open) lifts it over the keyboard; test sheets with an input
(`AddLinkSheet`, `MessageSheet`) on iOS and Android after changing it.

The scrim **fades** while the sheet **slides** (one Reanimated value, `progress`, both ways). Drag the top of the sheet
down to close it (or flick it). The sheet stays mounted until it has slid away, so callers just set `visible` to false;
keep showing the last content meanwhile (see `LessonSheet`). It starts sliding in the frame it appears (a layout
effect), so a tap feels answered at once. A sheet that opens goes on top of the ones already there (`order`): the
`OverlapSheet` → `LessonSheet` hand-off stacks right. While it's open it's `accessibilityViewIsModal` and screen readers
start on its title (`titleRef`, focused once the slide is done). No scroll bar: a sheet is short, and long content is
better split into pages (`BreakSheet`). A screen can pass its own `progress` and `height` shared values to move things
behind the sheet along with it, and `above`: something drawn over the scrim, under the sheet, so it isn't dimmed (the chat
lifts the message you long-pressed this way).

**Two-stage opening** (`peek`), for the Rooster grid only; every other sheet opens as before. The caller makes a
`SheetPeek` (`useSheetPeek`) and drives its `stage` from the UI thread: `peekSheet` (slides up `PEEK_PX`, ease out
120 ms, no scrim, touches go through), then `openPeek` (on to fully open in one motion, the scrim fading in from the peek
on) or `dropPeek` (back down, ease in 120 ms). `visible` still means open and taking touches; the caller sets it once the
sheet is open. A sheet with `peek` is **always mounted** (out of sight, untouchable, hidden from screen readers), so a
gesture can start showing it before React knows what was tapped; it keeps showing `PEEK_PX` when its content (and height)
comes in a frame later. With reduced motion a peek shows nothing and opening is a short fade (`FADE`).

## `Props`, `Sheet`

As above. The drag-down gesture is made once (`useMemo`, with `onClose` behind `lib/latest.useStable`), not on every render.
Only the sheet's own layer in the host renders again when the sheet renders.

## `SheetPeek`, `useSheetPeek`

The UI-thread side of a sheet that peeks: `stage` (`SHEET_IDLE`, `SHEET_PEEK`, `SHEET_OPEN`), its `progress` and `height`
(the sheet uses these instead of its own) and `reduced` (the system's reduce motion, for the worklets).

## `peekSheet`, `openPeek`, `dropPeek`

Worklets (callable from JS too). `peekSheet` only starts from out of sight; `openPeek` does nothing to an open sheet;
`dropPeek` only puts away a sheet that is peeking. `DayGrid` and `Calendar` are the callers.

## `PEEK_PX`, `SHEET_IDLE`, `SHEET_PEEK`, `SHEET_OPEN`

How much of a peeking sheet shows (104 px: the grabber, the title row and a bit of the first card; tune by feel), and
the stages.

## `OPEN`, `CLOSE`, `DISMISS_DISTANCE`, `DISMISS_VELOCITY`, `PEEK_IN`, `PEEK_OUT`, `FADE`

Open in 230 ms (ease out), close in 180 ms (ease in); dragged 120 px down or flicked → closes. The peek's 120 ms in
and out, and the reduced-motion fade.
