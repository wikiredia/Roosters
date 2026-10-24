---
updated: 2026-10-24T02:00:00Z
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

## `usePressScale`

Scale down a touch while pressed: `Button`, `IconButton` and `Chip` use it.

## `useFlash`

A 0 → 1 → 0 value for a short highlight.
