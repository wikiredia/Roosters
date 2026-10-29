import { useMemo } from 'react';

import type { BreakRequest, Lesson, Schedule, Together } from '@/api/types';
import { type Lang, translate } from '@/i18n';
import { slotState } from '@/lib/breaks';
import { dateAt } from '@/lib/days';
import { joinNames } from '@/lib/status';
import { isoDay } from '@/lib/time';

import { TAP_LESSON, TAP_OVERLAP, TAP_SKIPPED, TAP_TOGETHER, type TapTarget } from './TapTargets';
import {
  type Block,
  dayBlocks,
  freeGaps,
  isFree,
  kindsOf,
  type LegendItem,
  lessonKind,
  type LessonKind,
  mergeLessons,
  OVERLAP_SLOP,
  type Overlap,
  overlapsOf,
  type Span,
  type TogetherSlot,
} from './Timetable';

/** Asking for a break works for today and the 13 days after it (api breaks.MAX_DAYS_AHEAD) */
export const ASK_DAYS = 13;

/**
 * One day of the calendar with everything the screen derives from it, worked out once when its week arrives (see
 * `useDays`): nothing in a render or a gesture calls `mergeLessons` and friends again. Never changed afterwards: a
 * new object means the day changed, which is what lets a day column skip its render when nothing did.
 */
export type DayData = {
  /** Changes with every new object; `useDays` uses it to see that nothing changed */
  id: number;
  /** As the API gave them */
  lessons: Lesson[];
  /** Back-to-back lessons of a course as one (`mergeLessons`), as the grid draws them */
  merged: Lesson[];
  /** Shared breaks, overlapping ones as one. `muted`: over or too far ahead; today's breaks that end before now are
   * muted by whoever knows the time (`DayColumn`, `DayGrid`) */
  together: TogetherSlot[];
  /** The shared breaks per friend, as the API gave them (for "Pauze samen?" and what a skip changes) */
  raw: Together[];
  loading: boolean;
  /** Merged lessons and shared breaks as blocks; `past` is false everywhere: it depends on the time (`DayColumn`) */
  blocks: Block[];
  overlaps: Overlap[];
  free: Span[];
  /** The dots under the strip's date */
  kinds: LessonKind[];
  /** What this day adds to the legend */
  legend: LegendItem[];
  /** The earliest start and the latest end of the lessons, or null without lessons */
  bounds: Span | null;
  /** The merged lessons that could be skipped if they're still to come (`lib/skips.canSkip` without the time) */
  skippable: Span[];
  /** What a tap opens, for the UI thread (`TapTargets`) */
  taps: TapTarget[];
};

let ids = 0;

/** A week that hasn't come in: nothing on it yet, one object for every such day */
const WAITING: DayData = {
  id: 0,
  lessons: [],
  merged: [],
  together: [],
  raw: [],
  loading: true,
  blocks: [],
  overlaps: [],
  free: [],
  kinds: [],
  legend: [],
  bounds: null,
  skippable: [],
  taps: [],
};

type Context = { names: Map<number, string>; breaks: BreakRequest[] | undefined; only: number[] | undefined; onlyKey: string | undefined; today: number; lang: Lang };

/** The shared breaks as one yellow block each (overlapping ones merged, with everyone you share it with) */
function slotsOf(raw: Together[], iso: string, day: number, c: Context): TogetherSlot[] {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate(c.lang, key, params);
  const slots: { start: number; end: number; ids: number[] }[] = [];
  for (const s of [...raw].sort((a, b) => a.start - b.start)) {
    const last = slots[slots.length - 1];
    if (last && s.start < last.end) {
      last.end = Math.max(last.end, s.end);
      if (!last.ids.includes(s.id)) last.ids.push(s.id);
    } else slots.push({ start: s.start, end: s.end, ids: [s.id] });
  }
  return slots.map((g) => {
    const who = g.ids.map((id) => c.names.get(id) ?? '?');
    return {
      start: g.start,
      end: g.end,
      label: t('rooster.with', { names: joinNames(who, t('common.and')) }),
      names: who,
      // Asked, planned or declined: its own colour and pattern
      state: slotState(c.breaks, g.ids, iso, g.start, g.end),
      // Over, or further ahead than you can ask: faded, and a tap does nothing
      muted: day < c.today || day > c.today + ASK_DAYS,
    };
  });
}

function buildDay(day: number, lessons: Lesson[], together: Together[], loading: boolean, c: Context): DayData {
  const iso = isoDay(dateAt(day));
  const raw = together.filter((s) => !c.only || c.only.includes(s.id));
  const slots = slotsOf(raw, iso, day, c);
  const merged = mergeLessons(lessons);
  const overlaps = overlapsOf(lessons);
  const legend = new Set<LegendItem>();
  for (const s of slots) legend.add(s.state ?? 'together');
  for (const l of lessons) legend.add(l.state === 'cancelled' || l.state === 'removed' ? 'cancelled' : l.skipped ? 'skipped' : lessonKind(l));
  // In the order a tap is resolved (Calendar's onPress*): where lessons overlap (and near it), a lesson, a shared break
  // you can ask for, a class you skip
  const taps: TapTarget[] = [
    ...overlaps.map((o) => ({ day, start: o.start - OVERLAP_SLOP, end: o.end + OVERLAP_SLOP, kind: TAP_OVERLAP })),
    ...merged.filter((l) => !l.skipped).map((l) => ({ day, start: l.start, end: l.end, kind: TAP_LESSON })),
    ...slots.filter((s) => !s.muted).map((s) => ({ day, start: s.start, end: s.end, kind: TAP_TOGETHER })),
    ...merged.filter((l) => l.skipped).map((l) => ({ day, start: l.start, end: l.end, kind: TAP_SKIPPED })),
  ];
  return {
    id: ++ids,
    lessons,
    merged,
    together: slots,
    raw,
    loading,
    blocks: dayBlocks(lessons, slots, null),
    overlaps,
    free: freeGaps(lessons),
    kinds: kindsOf(lessons),
    legend: [...legend],
    bounds: lessons.length ? { start: Math.min(...lessons.map((l) => l.start)), end: Math.max(...lessons.map((l) => l.end)) } : null,
    skippable: merged.filter((l) => !!l.course && !isFree(l)).map((l) => ({ start: l.start, end: l.end })),
    taps,
  };
}

/** Per week that came in (TanStack keeps the same `Schedule` object while the data is the same, also across a 304):
 * its seven days for the context they were made in. A few contexts at most per week (Rooster and Vergelijken look at
 * the same weeks), dropped with the week. */
const built = new WeakMap<Schedule, { c: Context; days: DayData[] }[]>();

function same(a: Context, b: Context) {
  return a.names === b.names && a.breaks === b.breaks && a.onlyKey === b.onlyKey && a.today === b.today && a.lang === b.lang;
}

function daysOf(week: Schedule, monday: number, c: Context): DayData[] {
  const known = built.get(week) ?? [];
  const hit = known.find((k) => same(k.c, c));
  if (hit) return hit.days;
  const lessons = new Map<string, Lesson[]>();
  for (const l of week.lessons) {
    const of = lessons.get(l.day);
    if (of) of.push(l);
    else lessons.set(l.day, [l]);
  }
  const days = Array.from({ length: 7 }, (_, d) => {
    const iso = isoDay(dateAt(monday + d));
    return buildDay(monday + d, lessons.get(iso) ?? [], week.together?.[iso] ?? [], !!week.loading, c);
  });
  built.set(week, [{ c, days }, ...known].slice(0, 3));
  return days;
}

/**
 * The calendar's days: `weeks` are the weeks' data from `useWeeks` (undefined: not in yet), the first one starting on
 * the Monday `first` (a day index). Each week's days are built once and kept while its data, `names`, `breaks`,
 * `only`, today and the language stay the same, so moving the window reuses every week that is still in it, and a
 * refetch that changes nothing changes nothing here. The Map has the same identity until some day is a new object.
 */
export function useDays(data: (Schedule | undefined)[], first: number, names: Map<number, string>, breaks: BreakRequest[] | undefined, only: number[] | undefined, today: number, lang: Lang) {
  const onlyKey = only?.join();
  const c: Context = { names, breaks, only, onlyKey, today, lang };
  const all: DayData[] = data.flatMap((w, wi) => (w ? daysOf(w, first + wi * 7, c) : Array.from({ length: 7 }, () => WAITING)));
  const key = `${first}:${all.map((d) => d.id).join()}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` says whether any day is a different object
  return useMemo(() => new Map(all.map((d, i) => [first + i, d])), [key]);
}
