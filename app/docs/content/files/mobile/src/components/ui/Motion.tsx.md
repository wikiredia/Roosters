---
updated: 2026-10-30T02:00:00Z
---

**Motion in one place**, so everything moves the same way: short, soft, never in the way. Reanimated
(`react-native-reanimated`, with `react-native-worklets`); respects 'reduce motion'.

## `AView`, `APressable`

Animated View and Pressable made from the app's own `react-native` imports, so `className` keeps working
(Uniwind styles those). Use these instead of `Animated.View` when you need classes.

## `PRESS_IN`, `PRESS_OUT`, `SETTLE`, `FADE`

Spring and timing settings: a press (firm in, a little bounce out), things that follow a finger and settle
(the day handle, swiping weeks), a short fade.

## `enter`, `exit`, `layout`

Layout animations for things that appear, disappear or move (`entering={enter}`, `layout={layout}`).

**When not to use `layout`**: on anything whose size or place changes every frame of a gesture, or on many views at once
(the Rooster grid's blocks, a list that re-lays out while you pinch): every change restarts a layout animation per view.
The grid moves its columns with transforms and glides its blocks on shared values instead (`timetable/DayGrid`). Use
`layout` for a few views that move now and then (a row that comes and goes, a tip).

## `Reveal`

Wraps something that comes and goes (a banner, a section): it fades in and out, and what's around it slides
to its new place. Put it inside a component that may render nothing, so an empty one adds no gap.

## `usePressScale`

Scale down a touch while pressed: `Button`, `IconButton` and `Chip` use it.

## `useFlash`

A 0 → 1 → 0 value for a short highlight.
