import type { ReactNode } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Pressable, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

/**
 * Motion in one place, so everything moves the same way: short, soft, never in the way.
 * Animated versions of View and Pressable are made here, from the `react-native` the app imports,
 * so `className` keeps working on them (Uniwind styles the app's own react-native components).
 */
export const AView = Animated.createAnimatedComponent(View);
export const APressable = Animated.createAnimatedComponent(Pressable);

/** A press: quick and firm in, a little bounce out. */
export const PRESS_IN = { damping: 30, stiffness: 600, mass: 0.6 };
export const PRESS_OUT = { damping: 14, stiffness: 320, mass: 0.6 };
/** Things that follow a finger and then settle (the day handle, snapping weeks). */
export const SETTLE = { damping: 20, stiffness: 240, mass: 0.8 };
export const FADE = { duration: 180, easing: Easing.out(Easing.quad) };

/** Appearing, disappearing and moving up/down in a list: a fade and a short slide, no jumps. */
export const enter = FadeIn.duration(180);
export const exit = FadeOut.duration(120);
export const layout = LinearTransition.duration(200).easing(Easing.out(Easing.quad));

/** Something that comes and goes (a banner, a section): fades in, fades out, and what's around it slides
 * to its new place instead of jumping. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <AView entering={enter} exiting={exit} layout={layout} className={className}>
      {children}
    </AView>
  );
}

/** Scale down a touch while pressed. Spread `handlers` onto the Pressable and `style` onto it too. */
export function usePressScale(to = 0.96, props?: { onPressIn?: ((e: GestureResponderEvent) => void) | null; onPressOut?: ((e: GestureResponderEvent) => void) | null }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return {
    style,
    handlers: {
      onPressIn: (e: GestureResponderEvent) => {
        if (!reduced) scale.set(withSpring(to, PRESS_IN));
        props?.onPressIn?.(e);
      },
      onPressOut: (e: GestureResponderEvent) => {
        if (!reduced) scale.set(withSpring(1, PRESS_OUT));
        props?.onPressOut?.(e);
      },
    },
  };
}

/** 0 → 1 → 0 over `duration` ms whenever `key` changes: a gentle highlight. */
export function useFlash() {
  const v = useSharedValue(0);
  return {
    value: v,
    flash: () => {
      v.set(
        withTiming(1, { duration: 120 }, () => {
          v.set(withTiming(0, { duration: 260 }));
        }),
      );
    },
  };
}
