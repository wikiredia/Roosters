import type { Lesson, SkipRequest } from '@/api/types';

import { type DayData, nextDayId } from './DayCache';
import { TAP_FRIEND, type TapTarget } from './TapTargets';
import { isOff, mergeLessons, type Span } from './Timetable';

/**
 * A colour per friend you compare with, in the order you picked them: never blue (that's you) or yellow (a shared
 * break), and different for each one, so you see whose class is whose without a legend (the faces above the calendar
 * have a ring in the same colour). Strong colour for the edge; the fill is the same colour, see-through (`soft`), so
 * it reads in light and dark mode.
 */
export const FRIEND_COLORS = ['#F0487A', '#14B8A6', '#8B5CF6', '#F97316', '#22C55E', '#0EA5E9'] as const;

export function friendColor(i: number) {
  return FRIEND_COLORS[i % FRIEND_COLORS.length];
}

/** The fill of a friend's class: their colour, see-through */
export function soft(color: string) {
  return `${color}2E`;
}

/** An empty lane (nothing that day) is this much narrower than one with something on it: 'Leeg' in the middle */
export const EMPTY_W = 0.55;

/**
 * One person's part of a day in Vergelijken: you (`who` null: your lessons and shared breaks, as on the Rooster tab)
 * or a friend (their classes in their colour). `x0`–`x1` is its part of the day's width (0–1).
 */
export type Lane = {
  who: number | null;
  /** Shown above the lane: 'Jij', or the friend's first name */
  name: string;
  color: string | null;
  x0: number;
  x1: number;
  /** Loaded, and nothing on it that day: narrow, with 'Leeg' */
  empty: boolean;
  /** They don't show you their timetable */
  hidden: boolean;
  loading: boolean;
  /** A friend's classes, merged as the grid draws them (yours are in the day itself) */
  lessons: Lesson[];
  /** A friend's classes you asked them to skip, still open: dashed, 'Gevraagd' (only you see that) */
  asked: Span[];
};

/** A friend's day as it came in (one week per request, `useFriendWeeks`) */
export type FriendDay = { id: number; name: string; lessons: Lesson[]; loading: boolean; hidden: boolean };

const meets = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/**
 * `d` (your day) with a lane per person: you first, then each friend in `friends`' order. Your taps and draggable
 * classes stay in your lane; a friend's classes can be tapped (their sheet) and dragged into the bin (ask them to
 * skip it, `lane` = their place). The hours stretch for their classes too. A new object: give it the same inputs and
 * keep it (Calendar memoises the whole map).
 */
export function withLanes(d: DayData, day: number, friends: FriendDay[], asks: SkipRequest[], iso: string, youName: string): DayData {
  const youEmpty = !d.loading && !d.lessons.length && !d.together.length;
  const people = [
    { who: null as number | null, name: youName, color: null as string | null, empty: youEmpty, hidden: false, loading: d.loading, lessons: [] as Lesson[], asked: [] as Span[] },
    ...friends.map((f, i) => {
      const lessons = f.hidden ? [] : mergeLessons(f.lessons);
      return {
        who: f.id,
        name: f.name,
        color: friendColor(i),
        empty: !f.loading && (f.hidden || !lessons.length),
        hidden: f.hidden,
        loading: f.loading,
        lessons,
        asked: asks.filter((s) => s.mine && s.status === 'pending' && s.to.id === f.id && s.day === iso).map((s) => ({ start: s.start, end: s.end })),
      };
    }),
  ];
  const weights = people.map((p) => (p.empty ? EMPTY_W : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = 0;
  const lanes: Lane[] = people.map((p, i) => {
    const x0 = x;
    x += weights[i] / total;
    return { ...p, x0, x1: i === people.length - 1 ? 1 : x };
  });
  const me = lanes[0];
  const taps: TapTarget[] = d.taps.map((g) => ({ ...g, x0: me.x0, x1: me.x1 }));
  const skippable: DayData['skippable'] = d.skippable.map((s) => ({ ...s, x0: me.x0, x1: me.x1, lane: 0 }));
  lanes.forEach((lane, i) => {
    if (!i) return;
    for (const l of lane.lessons) {
      taps.push({ day, start: l.start, end: l.end, kind: TAP_FRIEND, x0: lane.x0, x1: lane.x1 });
      if (l.busy && !isOff(l) && !lane.asked.some((s) => meets(s, l))) skippable.push({ start: l.start, end: l.end, x0: lane.x0, x1: lane.x1, lane: i });
    }
  });
  const all = [...d.lessons, ...lanes.flatMap((l) => l.lessons)];
  return {
    ...d,
    id: nextDayId(),
    loading: d.loading,
    lanes,
    taps,
    skippable,
    bounds: all.length ? { start: Math.min(...all.map((l) => l.start)), end: Math.max(...all.map((l) => l.end)) } : null,
    anything: !youEmpty || lanes.some((l) => l.who !== null && !!l.lessons.length),
    waiting: d.loading || lanes.some((l) => l.loading),
  };
}

/** The lane at `frac` of the way across a day (0–1) */
export function laneAt(lanes: Lane[], frac: number) {
  return lanes.find((l) => frac >= l.x0 && frac < l.x1) ?? lanes[lanes.length - 1];
}
