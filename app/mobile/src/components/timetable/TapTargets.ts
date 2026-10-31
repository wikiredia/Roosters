import { useEffect } from 'react';
import { useSharedValue } from 'react-native-reanimated';

/** What a tap on the grid can open, as `TapTarget.kind`. Numbers, not names: they are read in a worklet. */
export const TAP_LESSON = 0;
export const TAP_OVERLAP = 1;
export const TAP_TOGETHER = 2;
export const TAP_SKIPPED = 3;
export const TAP_ALONE = 4;
/** One of a friend's classes (Vergelijken): its sheet, without skipping */
export const TAP_FRIEND = 5;

/**
 * A stretch of a day (minutes) where a tap opens a sheet: a lesson, lessons that overlap (the stretch includes
 * `OVERLAP_SLOP` minutes on both sides), a shared break you can ask for, a class you skip, or your own break with
 * nobody (a free gap where no shared break is drawn, today or later). `DayCache` makes them per day, in the order a
 * tap is resolved (overlap, lesson, shared break, skipped class, own break: the grid's `tapAt`). In Vergelijken a day
 * has a lane per person (`Lanes`): `x0`–`x1` is the part of the day's width (0–1) the target is in; left out: all of it.
 */
export type TapTarget = { day: number; start: number; end: number; kind: number; x0?: number; x1?: number };

/** What a tap at `min` on `day`, `frac` of the way across it (0–1), opens (a `TAP_*`), or -1 when it opens nothing.
 * Runs on the UI thread. */
export function tapKindAt(targets: TapTarget[], day: number, min: number, frac: number): number {
  'worklet';
  for (let i = 0; i < targets.length; i++) {
    const g = targets[i];
    if (g.day === day && g.start <= min && min < g.end && (g.x0 === undefined || (frac >= g.x0 && frac < (g.x1 ?? 1)))) return g.kind;
  }
  return -1;
}

/** Keeps the grid's tappable stretches in a shared value, for the tap gesture on the UI thread (as `useDragTargets`). */
export function useTapTargets(list: TapTarget[]) {
  const targets = useSharedValue<TapTarget[]>([]);
  const key = list.map((g) => `${g.day}:${g.kind}:${g.start}:${g.end}:${g.x0 ?? 0}:${g.x1 ?? 1}`).join();
  useEffect(() => {
    targets.set(list);
  }, [key]);
  return targets;
}
