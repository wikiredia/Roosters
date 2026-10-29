import { useEffect } from 'react';
import { useSharedValue } from 'react-native-reanimated';

/** What a tap on the grid can open, as `TapTarget.kind`. Numbers, not names: they are read in a worklet. */
export const TAP_LESSON = 0;
export const TAP_OVERLAP = 1;
export const TAP_TOGETHER = 2;
export const TAP_SKIPPED = 3;

/**
 * A stretch of a day (minutes) where a tap opens a sheet: a lesson, lessons that overlap (the stretch includes
 * `OVERLAP_SLOP` minutes on both sides), a shared break you can ask for, or a class you skip. `DayCache` makes them
 * per day, in the order a tap is resolved (overlap, lesson, shared break, skipped class: the grid's `tapAt`).
 */
export type TapTarget = { day: number; start: number; end: number; kind: number };

/** What a tap at `min` on `day` opens (a `TAP_*`), or -1 when it opens nothing. Runs on the UI thread. */
export function tapKindAt(targets: TapTarget[], day: number, min: number): number {
  'worklet';
  for (let i = 0; i < targets.length; i++) {
    const g = targets[i];
    if (g.day === day && g.start <= min && min < g.end) return g.kind;
  }
  return -1;
}

/** Keeps the grid's tappable stretches in a shared value, for the tap gesture on the UI thread (as `useDragTargets`). */
export function useTapTargets(list: TapTarget[]) {
  const targets = useSharedValue<TapTarget[]>([]);
  const key = list.map((g) => `${g.day}:${g.kind}:${g.start}:${g.end}`).join();
  useEffect(() => {
    targets.set(list);
  }, [key]);
  return targets;
}
