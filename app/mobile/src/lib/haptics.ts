import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Only taps, never a buzz: a soft one while something passes a snap point, a firmer one when it lands
const on = Platform.OS === 'ios' || Platform.OS === 'android';

/** A light tap: dragging or pinching, the value just passed a whole day (or week). Call from JS (scheduleOnRN in a worklet). */
export function tick() {
  if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A firmer tap: let go and it settles on a day. */
export function snap() {
  if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/**
 * A gentle pull towards whole numbers for a live dragged value (days): it sticks a little near a whole day and moves
 * a little quicker halfway, so it reads as "per day" without jumping. Never goes backwards (pull < 1), equals x at
 * every whole and half number. Worklet: use it inside gesture callbacks.
 */
export function magnet(x: number, pull = 0.3): number {
  'worklet';
  const r = Math.round(x);
  const d = x - r;
  return r + d - (pull * Math.sin(2 * Math.PI * d)) / (2 * Math.PI);
}
