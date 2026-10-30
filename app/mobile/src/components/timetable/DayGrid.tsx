import { memo, type ReactNode, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { type AnimatedProps, FadeIn, FadeInLeft, FadeInRight, interpolate, type SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { ViewProps } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import { scheduleOnRN } from 'react-native-worklets';

import type { Lesson } from '@/api/types';
import { AView } from '@/components/ui/Motion';
import { Skeleton } from '@/components/ui/Screen';
import { dropPeek, openPeek, peekSheet, SHEET_PEEK, type SheetPeek } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { type Lang, useT } from '@/i18n';
import { dateAt, MAX_DAYS, snap } from '@/lib/days';
import { useStable } from '@/lib/latest';
import { noteColumnRender } from '@/lib/perf';
import { hhmm, weekdayShort } from '@/lib/time';

import type { DayData } from './DayCache';
import { type DragTarget, type SkipDrag, useDragTargets, useSkipDrag, useSkipGesture } from './SkipDrag';
import { TAP_OVERLAP, TAP_TOGETHER, type TapTarget, tapKindAt, useTapTargets } from './TapTargets';
import { type Block, BlockView, lessonLabel, lessonsIn, OverlapBand, type Span } from './Timetable';

/** Height of the date above each column. */
export const LABEL_H = 22;
/** Swipes settle calmly: no bouncing back and forth through days. */
export const SWIPE = { damping: 28, stiffness: 230, mass: 1 };
/** The number of days settles with a little bounce. */
export const RESIZE = { damping: 16, stiffness: 240, mass: 0.8 };
/** How long (ms) after a tap a second one still makes it a double tap (zoom). A single tap's sheet peeks at once
 * and opens fully when this runs out: lower opens sooner, too low makes double taps hard. Tune by feel. */
export const DOUBLE_TAP_DELAY = 200;

/** The sheets a tap on the grid opens, each with its UI-thread peek (components/ui/Sheet `useSheetPeek`):
 * a lesson (or a skipped class), lessons that overlap, a shared break. */
export type GridPeeks = { lesson: SheetPeek; overlap: SheetPeek; ask: SheetPeek };

/** The hours as they are on screen right now, on the UI thread: the first hour and pixels per hour. They glide to
 * the new values when the hours change (a zoom, or a day with an earlier lesson), and the blocks of the days in
 * `range` (the days in view: first, last) and the time axis follow them. Everything else jumps. Calendar drives it. */
export type GridZoom = { h0: SharedValue<number>; pph: SharedValue<number>; range: SharedValue<[number, number]> };

/** What a day column needs to know about the view without being rendered by it: the direction you went last (new
 * lessons come in from that side), and the first day and number of days you're on (a column only fades its lessons in
 * when they arrive in view). `Calendar` keeps it up to date; reading it (`get`) never causes a render. */
export type GridView = { get: () => { dir: 1 | -1; start: number; want: number } };

type Props = {
  /** Left edge of the view, in days (lib/days), and how many days fit: both animated, shared with the strip. */
  offset: SharedValue<number>;
  count: SharedValue<number>;
  /** Saturdays (day indices) of weekends with something on them: a swipe doesn't skip those. */
  busyWeekends: SharedValue<number[]>;
  width: number;
  height: number;
  /** The days with data (the weeks around the view): what a tap or a drag can find. */
  from: number;
  to: number;
  /** The first day in view and how many, as React knows them: the columns that exist are these, plus as many
   * again on each side (more while a gesture goes further, see `mounted`). */
  start: number;
  want: number;
  zoom: GridZoom;
  /** The day's data (`DayCache`): a new function when some day changed, the same `DayData` objects for the others */
  data: (day: number) => DayData | undefined;
  hours: [number, number];
  today: number;
  /** The time of day (minutes): today's 'now' line, and what's over today. Only today's column gets it. */
  nowMin: number;
  /** Which side new lessons come in from, and where you are (see `GridView`). */
  view: GridView;
  /** Short course names (narrow columns). */
  compact: boolean;
  lang: Lang;
  /** `peek`: the tap came from the grid's gesture, which already started that sheet's peek (`peeks`); without
   * (a screen reader) the sheet opens fully at once */
  onPressLesson: (l: Lesson, day: number, peek?: boolean) => void;
  /** A tap on (or close to) lessons that overlap: the screen asks which one you mean */
  onPressOverlap: (ls: Lesson[], day: number, peek?: boolean) => void;
  /** A tap on a shared break: that day and the break (the screen asks "Pauze samen?") */
  onPressTogether: (day: number, span: Span, peek?: boolean) => void;
  /** A tap the UI thread thought would open something, but on JS nothing was there (the data just changed) */
  onPressNothing: () => void;
  /** The sheets a tap opens: their peek starts on the UI thread in the frame the finger lifts */
  peeks: GridPeeks;
  /** The double tap's window ran out after a single tap: the peeking sheet went on to open fully */
  onPeekOpen: () => void;
  /** Where a swipe will land: called as the finger lets go, so dates and data update before it gets there. */
  onTarget: (start: number) => void;
  /** Pinch: how many days you see (live while pinching is the shared `count`). */
  onCount: (n: number, start: number) => void;
  onDoubleTap: () => void;
  /** Drag a class into the bin to skip it (components/timetable/SkipDrag.tsx): the drag's shared state, and what
   * happens when a finger comes down on a class and when it lands in the bin. Without: classes don't move. */
  drag?: SkipDrag;
  onPickClass?: (day: number, start: number) => void;
  onDropClass?: (day: number, start: number) => void;
};

/**
 * The days side by side, as one continuous strip you scroll through with your finger (day by day, see
 * `days.snap`), as far back or ahead as you like. Every column is placed from the shared `offset` and `count`
 * on the UI thread, so the strip above, the columns and their widths move together in the same frame:
 * dragging the strip's handle or pinching makes the columns thinner while the next days slide in from the side.
 * Double tap zooms the hours in on your lessons (the screen decides); pinch shows more or fewer days. A class of yours
 * can be picked up and dragged into the bin on the right to skip it (`drag`; see SkipDrag.useSkipGesture for how
 * that's told apart from a swipe or a tap).
 * Memo: give it stable callbacks (Calendar does), so opening a sheet doesn't re-render every column. The gestures are
 * made once and again only when the size or hours change, so those callbacks must stay the same too.
 */
export const DayGrid = memo(function DayGrid(p: Props) {
  const { offset, count, busyWeekends, width, height, from, to, start, want, zoom, data, hours, today, nowMin, compact, lang, view, onPressLesson, onPressOverlap, onPressTogether, onPressNothing, peeks, onPeekOpen, onTarget, onCount, onDoubleTap, drag, onPickClass, onDropClass } = p;
  const lineColor = String(useCSSVariable('--color-line') ?? '#E4E1DA');
  const [h0, h1] = hours;
  const pxPerHour = (height - LABEL_H) / Math.max(1, h1 - h0);
  const startOffset = useSharedValue(0);
  const startCount = useSharedValue(1);
  const focal = useSharedValue(0);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-12, 12])
        .onBegin(() => {
          startOffset.set(offset.get());
        })
        .onUpdate((e) => {
          offset.set(startOffset.get() - e.translationX / (width / count.get()));
        })
        .onEnd((e) => {
          const colW = width / count.get();
          const start = Math.round(startOffset.get());
          const busy = busyWeekends.get();
          const target = snap(start, Math.round(count.get()), -e.translationX / colW, -e.velocityX / colW, (sat) => !busy.includes(sat));
          scheduleOnRN(onTarget, target);
          offset.set(withSpring(target, { ...SWIPE, velocity: -e.velocityX / colW }));
        }),
    [offset, count, busyWeekends, startOffset, width, onTarget],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin((e) => {
          startCount.set(count.get());
          startOffset.set(offset.get());
          focal.set(e.focalX);
        })
        .onUpdate((e) => {
          const n = Math.max(1, Math.min(MAX_DAYS, startCount.get() / e.scale));
          // The day under your fingers stays under your fingers
          const anchor = startOffset.get() + focal.get() / (width / startCount.get());
          count.set(n);
          offset.set(anchor - focal.get() / (width / n));
        })
        .onEnd(() => {
          const n = Math.max(1, Math.min(MAX_DAYS, Math.round(count.get())));
          const start = Math.round(offset.get());
          count.set(withSpring(n, RESIZE));
          offset.set(withSpring(start, SWIPE));
          scheduleOnRN(onCount, n, start);
        }),
    [offset, count, startCount, startOffset, focal, width, onCount],
  );

  // What the grid shows is in `data`, `nowMin` and the size at this render; the tap gesture below is made once and
  // calls this one, which is always the newest
  const tapAt = useStable((x: number, y: number, off: number, n: number) => {
    const day = Math.floor(off + x / (width / n));
    const min = h0 * 60 + ((y - LABEL_H) / pxPerHour) * 60;
    const d = data(day);
    if (!d) return onPressNothing();
    const hits = lessonsIn(d.merged, d.overlaps, min);
    if (hits.length > 1) onPressOverlap(hits, day, true);
    else if (hits.length === 1) onPressLesson(hits[0], day, true);
    else {
      // A hatched one (over, or too far ahead) can't be asked for; a shared break over a skipped class goes first
      const s = d.together.find((x) => x.start <= min && min < x.end);
      const skipped = lessonsIn(d.merged, d.overlaps, min, true)[0];
      if (s && !s.muted && !(day === today && s.end <= nowMin)) onPressTogether(day, { start: s.start, end: s.end }, true);
      else if (skipped) onPressLesson(skipped, day, true);
      else onPressNothing();
    }
  });

  // Classes that can still be skipped (not over, not cancelled or skipped already), and everything a tap can open,
  // as the columns draw them: copied into shared values for the gestures on the UI thread
  const hasDrag = !!drag;
  const lists = useMemo(() => {
    const drags: DragTarget[] = [];
    const taps: TapTarget[] = [];
    for (let day = from; day <= to; day++) {
      const d = data(day);
      if (!d) continue;
      if (hasDrag) for (const l of d.skippable) if (day > today || (day === today && l.end > nowMin)) drags.push({ day, start: l.start, end: l.end });
      for (const g of d.taps) if (!(g.kind === TAP_TOGETHER && day === today && g.end <= nowMin)) taps.push(g);
    }
    return { drags, taps };
  }, [data, from, to, today, nowMin, hasDrag]);
  const targets = useDragTargets(lists.drags);
  const tapTargets = useTapTargets(lists.taps);

  // Taps go through the gesture system too (not a Pressable per lesson): a swipe or pinch can never end
  // as a tap on the lesson under your finger. The single tap doesn't wait for the double tap: they run side by side.
  // The UI thread knows what's under the finger (the stretches in `tapTargets`), so a tap on something starts that
  // sheet's peek in the frame the finger lifts, and only then tells JS what to put in it; a tap on nothing never
  // wakes JS. A second tap within the double tap's window is never a tap of its own (`second`): the double tap
  // takes it, drops the peek and zooms. No second tap: the window runs out and the peek goes on to open fully.
  // `pending`: the double tap is waiting for a second tap after a first one ended; `waiting`: it's still in the race.
  const pending = useSharedValue(false);
  const waiting = useSharedValue(false);
  const second = useSharedValue(false);
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(8)
        .onBegin(() => {
          second.set(pending.get());
        })
        .onEnd((e, ok) => {
          if (!ok || second.get()) return;
          // The double tap may have given up already (a long press): then there is no window to wait for
          const live = waiting.get();
          if (live) pending.set(true);
          const off = offset.get();
          const n = count.get();
          const day = Math.floor(off + e.x / (width / n));
          const min = h0 * 60 + ((e.y - LABEL_H) / pxPerHour) * 60;
          const kind = tapKindAt(tapTargets.get(), day, min);
          if (kind < 0) return;
          const sheet = kind === TAP_OVERLAP ? peeks.overlap : kind === TAP_TOGETHER ? peeks.ask : peeks.lesson;
          if (live) peekSheet(sheet);
          else openPeek(sheet);
          scheduleOnRN(tapAt, e.x, e.y, off, n);
        }),
    [offset, count, tapTargets, width, h0, pxPerHour, tapAt, peeks, pending, waiting, second],
  );

  const ownDrag = useSkipDrag();
  const skip = useSkipGesture({
    drag: drag ?? ownDrag,
    targets,
    offset,
    count,
    width,
    height,
    min0: h0 * 60,
    min1: h1 * 60,
    pxPerHour,
    labelH: LABEL_H,
    onPick: onPickClass ?? noop,
    onDrop: onDropClass ?? noop,
    enabled: !!drag,
  });

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(DOUBLE_TAP_DELAY)
        .onBegin(() => {
          waiting.set(true);
        })
        .onEnd((_e, ok) => {
          if (!ok) return;
          // Zoom, and the sheet the first tap peeked is never opened (Calendar forgets it)
          dropPeek(peeks.lesson);
          dropPeek(peeks.overlap);
          dropPeek(peeks.ask);
          scheduleOnRN(onDoubleTap);
        })
        .onFinalize((_e, ok) => {
          waiting.set(false);
          pending.set(false);
          if (ok) return;
          // The window ran out (or the gesture failed): the peek goes on to open, in one motion
          let opened = false;
          for (const sheet of [peeks.lesson, peeks.overlap, peeks.ask]) {
            if (sheet.stage.get() !== SHEET_PEEK) continue;
            openPeek(sheet);
            opened = true;
          }
          if (opened) scheduleOnRN(onPeekOpen);
        }),
    [onDoubleTap, onPeekOpen, peeks, pending, waiting],
  );

  // The pinch alongside everything; then a class drag, a swipe, and the taps (single and double side by side)
  const gesture = useMemo(() => Gesture.Simultaneous(pinch, Gesture.Exclusive(skip, pan, Gesture.Simultaneous(doubleTap, tap))), [pinch, skip, pan, doubleTap, tap]);

  // The columns that exist: what you see plus as many days again on each side, so a swipe lands on columns that are
  // there already (the data is fetched further out, see Calendar). A gesture that goes further than that (a pinch to
  // 7 days, the strip pushed against its edge) adds columns as it crosses each whole day: `live`, until React's view
  // moves (then the window follows it again).
  const buffer = Math.ceil(want);
  const baseA = start - buffer;
  const baseB = start + want - 1 + buffer;
  const [live, setLive] = useState<[number, number] | null>(null);
  const [base, setBase] = useState(`${baseA}:${baseB}`);
  if (base !== `${baseA}:${baseB}`) {
    setBase(`${baseA}:${baseB}`);
    setLive(null);
  }
  const a = Math.min(baseA, live?.[0] ?? baseA);
  const b = Math.max(baseB, live?.[1] ?? baseB);
  const mounted = useSharedValue<[number, number]>([a, b]);
  useEffect(() => {
    mounted.set([a, b]);
  }, [a, b, mounted]);
  const extend = useStable((lo: number, hi: number) => setLive((l) => [Math.min(lo, l?.[0] ?? lo), Math.max(hi, l?.[1] ?? hi)]));
  useAnimatedReaction(
    // The days on screen, one more on each side
    () => [Math.floor(offset.get()) - 1, Math.ceil(offset.get() + count.get())] as [number, number],
    (v, prev) => {
      if (prev && v[0] === prev[0] && v[1] === prev[1]) return;
      const m = mounted.get();
      if (v[0] < m[0] || v[1] > m[1]) scheduleOnRN(extend, v[0], v[1]);
    },
  );
  const days: number[] = [];
  for (let i = a; i <= b; i++) days.push(i);

  // The day separators: one drawing of dotted lines a column apart that moves by the part of a column you've
  // swiped (it repeats every column), instead of a drawing per column. While the number of days changes they fade out
  // (their spacing is React's), and come back once it settles.
  const colW = width / want;
  const separators = useAnimatedStyle(() => {
    const off = offset.get();
    const n = count.get();
    return {
      opacity: interpolate(Math.abs(n - want), [0.02, 0.15], [1, 0], 'clamp'),
      transform: [{ translateX: -(off - Math.floor(off)) * (width / n) }],
    };
  });
  // The hour lines, for every hour of the day (so a zoom has lines to show coming in), placed by React for the
  // current hours and moved to where the hours are right now (`zoom`) while they glide
  const lines = useAnimatedStyle(() => {
    const pc = zoom.pph.get();
    const k = pc / pxPerHour;
    return { transform: [{ translateY: h0 * pxPerHour - zoom.h0.get() * pc }, { scaleY: k }] };
  });

  return (
    <GestureDetector gesture={gesture}>
      <View className="flex-1 overflow-hidden" style={{ height }}>
        {/* Hour lines: subtle and dotted, behind everything */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: LABEL_H - 1, width, height: height - LABEL_H + 2, overflow: 'hidden' }}>
          <AView style={[{ position: 'absolute', left: 0, top: 1 - h0 * pxPerHour, width, height: 24 * pxPerHour + 2, transformOrigin: 'top' }, lines]}>
            <Svg width={width} height={24 * pxPerHour + 2}>
              {Array.from({ length: 25 }, (_, i) => (
                <Line key={i} x1={0} x2={width} y1={i * pxPerHour} y2={i * pxPerHour} stroke={lineColor} strokeWidth={1} strokeDasharray="2 4" />
              ))}
            </Svg>
          </AView>
        </View>
        <AView pointerEvents="none" style={[{ position: 'absolute', left: 0, top: LABEL_H, width: width + colW, height: height - LABEL_H }, separators]}>
          <Svg width={width + colW} height={height - LABEL_H}>
            {Array.from({ length: want + 2 }, (_, i) => (
              <Line key={i} x1={i * colW + 1} x2={i * colW + 1} y1={0} y2={height - LABEL_H} stroke={lineColor} strokeWidth={1} strokeDasharray="2 4" />
            ))}
          </Svg>
        </AView>
        {days.map((day) => (
          <DayColumn
            key={day}
            day={day}
            offset={offset}
            count={count}
            width={width}
            height={height}
            pxPerHour={pxPerHour}
            data={data(day)}
            hours={hours}
            zoom={zoom}
            today={today}
            nowMin={day === today ? nowMin : null}
            compact={compact}
            lang={lang}
            view={view}
            onPressLesson={onPressLesson}
            onPressOverlap={onPressOverlap}
            onPressTogether={onPressTogether}
          />
        ))}
      </View>
    </GestureDetector>
  );
});

const noop = () => {};

type ColumnProps = {
  day: number;
  offset: SharedValue<number>;
  count: SharedValue<number>;
  width: number;
  height: number;
  pxPerHour: number;
  data: DayData | undefined;
  hours: [number, number];
  zoom: GridZoom;
  today: number;
  /** The time of day, for today's column only: the others are not concerned by it (null) and don't render every minute */
  nowMin: number | null;
  compact: boolean;
  lang: Lang;
  view: GridView;
  onPressLesson: Props['onPressLesson'];
  onPressOverlap: Props['onPressOverlap'];
  onPressTogether: Props['onPressTogether'];
};

/**
 * One day. Placed on the UI thread from `offset` and `count`: moved with a transform (a swipe moves nothing else), sized
 * with `width`, which only changes with the number of days. It re-renders only when its own props change (its data, the
 * hours, the size, the minute on today's column), never because of a swipe: every prop is a number, a string, a shared
 * value, one of the cache's `DayData` objects or a callback that keeps its identity.
 */
const DayColumn = memo(function DayColumn({ day, offset, count, width, height, pxPerHour, data, hours, zoom, today, nowMin, compact, lang, view, onPressLesson, onPressOverlap, onPressTogether }: ColumnProps) {
  noteColumnRender(day);
  const { t } = useT();
  const place = useAnimatedStyle(() => ({ transform: [{ translateX: (day - offset.get()) * (width / count.get()) }] }));
  const size = useAnimatedStyle(() => ({ width: width / count.get() }));
  const date = dateAt(day);
  const isToday = day === today;
  const [h0, h1] = hours;
  // What's over: all of a past day, the lessons and shared breaks that ended before now today
  const now = isToday ? nowMin : day < today ? 24 * 60 : null;
  const blocks = useMemo<Block[]>(() => {
    const all = data?.blocks ?? [];
    if (now == null) return all;
    return all.map((b) => (b.type === 'lesson' ? (b.lesson.end <= now ? { ...b, past: true } : b) : b.type === 'together' && isToday && !b.muted && b.span.end <= now ? { ...b, muted: true } : b));
  }, [data, now, isToday]);
  const overlaps = data?.overlaps ?? [];
  const free = data?.free ?? [];
  const y = (min: number) => LABEL_H + ((min - h0 * 60) / 60) * pxPerHour;
  // Where a stretch goes with the hours as React has them; `Placed` moves it along while the hours glide
  const at = (s: Span, minH: number) => {
    const top = y(Math.max(s.start, h0 * 60));
    return { top, h: Math.max(y(Math.min(s.end, h1 * 60)) - top - 3, minH), start: s.start, end: s.end, minH, day, zoom, gridH: height };
  };
  // Lessons slide in only when they arrive after the skeleton, on a day you're looking at (from the side you went
  // to); a column that mounts with its data, or gets it out of sight, shows them as they are
  const loading = !data || data.loading;
  const inView = () => {
    const v = view.get();
    return day >= v.start && day < v.start + Math.ceil(v.want);
  };
  const [wasLoading, setWasLoading] = useState(loading);
  const [arrived, setArrived] = useState<1 | -1 | null>(null);
  // A column that mounts out of sight (the edges of the window while you swipe) doesn't animate anything, not even its skeleton
  const [calm] = useState(() => !inView());
  if (wasLoading !== loading) {
    setWasLoading(loading);
    if (wasLoading && inView()) setArrived(view.get().dir);
  }
  const entering = arrived ? (arrived > 0 ? FadeInRight : FadeInLeft).duration(240) : undefined;
  return (
    <AView className="absolute top-0 left-0" style={[{ height }, place, size]}>
      <View style={{ height: LABEL_H }} className="items-center justify-center">
        <Text variant="xs" bold tone={isToday ? 'you' : day % 7 >= 5 ? 'ink3' : 'ink2'} numberOfLines={1}>
          {`${weekdayShort(date, lang).toLowerCase()} ${date.getDate()}`}
        </Text>
      </View>
      {/* Free moments between lessons: behind everything (a shared break or a cancelled lesson goes over them) */}
      {free.map((f) => (
        <Placed key={`free:${f.start}`} {...at(f, 10)} entering={entering} accessible accessibilityLabel={`${t('tt.free')}, ${hhmm(f.start)} ${t('tt.to')} ${hhmm(f.end)}`}>
          <View pointerEvents="none" style={{ flex: 1 }}>
            <BlockView block={{ type: 'free', span: f }} style={{ flex: 1 }} compact={compact} t={t} />
          </View>
        </Placed>
      ))}
      {blocks.map((b) => {
        const s = b.type === 'lesson' ? { start: b.lesson.start, end: b.lesson.end } : 'span' in b ? b.span : { start: 0, end: 0 };
        const key = b.type === 'lesson' ? `${b.lesson.start}:${b.lesson.course}:${b.lesson.location}` : `${b.type}:${s.start}`;
        return (
          // Touches go to the grid's tap gesture; screen readers activate the block itself
          <Placed
            key={key}
            {...at(s, 16)}
            entering={entering}
            accessible
            accessibilityRole="button"
            accessibilityLabel={b.type === 'lesson' ? lessonLabel(b.lesson, t) : t('tt.together')}
            onAccessibilityTap={() => (b.type === 'lesson' ? onPressLesson(b.lesson, day) : b.type === 'together' && !b.muted ? onPressTogether(day, s) : undefined)}
          >
            <View pointerEvents="none" style={{ flex: 1 }}>
              <BlockView block={b} style={{ flex: 1 }} compact={compact} t={t} />
            </View>
          </Placed>
        );
      })}
      {/* Lessons at the same time: a hatched band over the shared stretch, on top of both blocks */}
      {overlaps.map((o) => {
        const p = at(o, 6);
        return (
          <Placed key={`overlap:${o.start}`} {...p} entering={entering} accessible accessibilityRole="button" onAccessibilityTap={() => onPressOverlap(o.lessons, day)}>
            <OverlapBand overlap={o} style={{ flex: 1 }} compact={compact} label={p.h >= 20} t={t} />
          </Placed>
        );
      })}
      {data?.loading && blocks.length === 0 ? (
        <AView entering={calm ? undefined : FadeIn} className="absolute left-1 right-1 gap-2" style={{ top: y(h0 * 60 + 60) }} pointerEvents="none">
          <Skeleton className="h-14 rounded-block" />
          <Skeleton className="h-9 rounded-block" />
          <Skeleton className="h-16 rounded-block" />
        </AView>
      ) : null}
      {isToday && nowMin != null && nowMin >= h0 * 60 && nowMin <= h1 * 60 ? (
        <Placed {...at({ start: nowMin, end: nowMin }, 0)} line pointerEvents="none">
          <View className="flex-1 bg-ink">
            <View className="absolute bg-ink rounded-full w-2 h-2" style={{ left: -3, top: -3 }} />
          </View>
        </Placed>
      ) : null}
    </AView>
  );
});

type PlacedProps = Omit<AnimatedProps<ViewProps>, 'style'> & {
  /** Where React puts it (the current hours) */
  top: number;
  h: number;
  /** The stretch it shows (minutes), its smallest height, its day, and the grid's height: to place it while the hours glide */
  start: number;
  end: number;
  minH: number;
  day: number;
  zoom: GridZoom;
  gridH: number;
  /** The 'now' line: 2 px high at `start`, the column's full width */
  line?: boolean;
  children?: ReactNode;
};

/**
 * A block in a day column, at `top`/`h`. While the hours glide (`GridZoom`) the blocks of the days in view are placed
 * from the hours on screen right now instead, frame by frame (at most 7 columns of a few blocks, for ~250 ms); the rest
 * jump. Its animated style only runs when the zoom's values change, never during a swipe.
 */
function Placed({ top, h, start, end, minH, day, zoom, gridH, line, ...rest }: PlacedProps) {
  const style = useAnimatedStyle(() => {
    const r = zoom.range.get();
    if (day < r[0] || day > r[1]) return { top, height: line ? 2 : h };
    const a = zoom.h0.get() * 60;
    const p = zoom.pph.get();
    const b = a + ((gridH - LABEL_H) / p) * 60;
    const y = (m: number) => LABEL_H + ((m - a) / 60) * p;
    if (line) return { top: y(start), height: 2 };
    const t = y(Math.max(start, a));
    return { top: t, height: Math.max(y(Math.min(end, b)) - t - 3, minH) };
  });
  return <AView {...rest} style={[line ? styles.line : styles.block, style]} />;
}

const styles = { block: { position: 'absolute', left: 2, right: 2 }, line: { position: 'absolute', left: 0, right: 0 } } as const;
