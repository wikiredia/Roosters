import { memo, type ReactNode, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { FadeIn, FadeInLeft, FadeInRight, type SharedValue, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import { scheduleOnRN } from 'react-native-worklets';

import type { Lesson } from '@/api/types';
import { AView } from '@/components/ui/Motion';
import { Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { type Key, type Lang, useT } from '@/i18n';
import { dateAt, MAX_DAYS, snap } from '@/lib/days';
import { magnet, snap as snapTap, tick } from '@/lib/haptics';
import { useStable } from '@/lib/latest';
import { noteColumnRender } from '@/lib/perf';
import { hhmm, weekdayShort } from '@/lib/time';

import type { DayData } from './DayCache';
import { FriendLane } from './FriendLane';
import { laneAt } from './Lanes';
import { type DragTarget, type SkipDrag, useDragTargets, useSkipDrag, useSkipGesture } from './SkipDrag';
import { TAP_ALONE, TAP_TOGETHER, type TapTarget, tapKindAt, useTapTargets } from './TapTargets';
import { type AxisLive, type Block, BlockView, lessonLabel, lessonsIn, OverlapBand, type Span, useAxisLive } from './Timetable';

/** Height of the date above each column. */
export const LABEL_H = 22;
/** Vergelijken: the row with each person's name under the date (the header is then `LABEL_H + NAME_H`). */
export const NAME_H = 18;
/** Swipes settle calmly: no bouncing back and forth through days. */
export const SWIPE = { damping: 28, stiffness: 230, mass: 1 };
/** The number of days settles with a little bounce. */
export const RESIZE = { damping: 16, stiffness: 240, mass: 0.8 };
/** A live value counts as on a whole day (a tap) this close to it, in days. */
const NEAR = 0.15;

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
  /** The days rendered (a window around the view; columns outside it don't exist). */
  from: number;
  to: number;
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
  /** Height of the header above the hours: `LABEL_H`, or with the names row in Vergelijken `LABEL_H + NAME_H` */
  labelH?: number;
  /** A lesson tapped; `friend`: one of that friend's classes (Vergelijken), not yours */
  onPressLesson: (l: Lesson, day: number, friend?: number) => void;
  /** A tap on (or close to) lessons that overlap: the screen asks which one you mean */
  onPressOverlap: (ls: Lesson[], day: number) => void;
  /** A tap on a shared break: that day and the break (the screen asks "Pauze samen?") */
  onPressTogether: (day: number, span: Span) => void;
  /** A tap on your own break with nobody (a free gap where no shared break is): that day and that stretch of it */
  onPressAlone: (day: number, span: Span) => void;
  /** Where a swipe will land: called as the finger lets go, so dates and data update before it gets there. */
  onTarget: (start: number) => void;
  /** Pinch: how many days you see (live while pinching is the shared `count`). */
  onCount: (n: number, start: number) => void;
  onDoubleTap: () => void;
  /** Drag a class into the bin to skip it (components/timetable/SkipDrag.tsx): the drag's shared state, and what
   * happens when a finger comes down on a class and when it lands in the bin. Without: classes don't move. */
  drag?: SkipDrag;
  onPickClass?: (day: number, start: number, lane: number) => void;
  onDropClass?: (day: number, start: number, lane: number) => void;
  /** The hours while the axis is dragged (`Timetable.useAxisLive`, Calendar): the hour lines and the lessons follow them */
  axis?: AxisLive;
};

/**
 * The days side by side, as one continuous strip you scroll through with your finger (day by day, see
 * `days.snap`), as far back or ahead as you like. Every column is placed from the shared `offset` and `count`
 * on the UI thread, so the strip above, the columns and their widths move together in the same frame:
 * dragging the strip's handle or pinching makes the columns thinner while the next days slide in from the side.
 * Double tap zooms the hours in on your lessons (the screen decides); pinch shows more or fewer days, always from
 * the day on the left (it stays there; zooming out adds days on the right). While swiping or pinching the value is
 * pulled a little towards whole days (`magnet`) with a light tap on each one, and a firmer one as you let go. A class of yours
 * can be picked up and dragged into the bin on the right to skip it (`drag`; see SkipDrag.useSkipGesture for how
 * that's told apart from a swipe or a tap).
 * Memo: give it stable callbacks (Calendar does), so opening a sheet doesn't re-render every column. The gestures are
 * made once and again only when the size or hours change, so those callbacks must stay the same too.
 */
export const DayGrid = memo(function DayGrid(p: Props) {
  const { offset, count, busyWeekends, width, height, from, to, data, hours, today, nowMin, compact, lang, labelH = LABEL_H, view, onPressLesson, onPressOverlap, onPressTogether, onPressAlone, onTarget, onCount, onDoubleTap, drag, onPickClass, onDropClass, axis } = p;
  const ownAxis = useAxisLive();
  const live = axis ?? ownAxis;
  const lineColor = String(useCSSVariable('--color-line') ?? '#E4E1DA');
  const [h0, h1] = hours;
  const pxPerHour = (height - labelH) / Math.max(1, h1 - h0);
  const startOffset = useSharedValue(0);
  const startCount = useSharedValue(1);
  // The whole day (first day, number of days) the last tap was for: one tap per day, not one per frame
  const panDay = useSharedValue(NaN);
  const pinchDays = useSharedValue(NaN);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-12, 12])
        .onBegin(() => {
          startOffset.set(offset.get());
          panDay.set(nearDay(offset.get()));
        })
        .onUpdate((e) => {
          // A soft pull towards each whole day, so a swipe reads as day by day without jumping
          const off = pulled(startOffset.get(), startOffset.get() - e.translationX / (width / count.get()));
          offset.set(off);
          if (onNewDay(off, panDay)) scheduleOnRN(tick);
        })
        .onEnd((e) => {
          const colW = width / count.get();
          const start = Math.round(startOffset.get());
          const busy = busyWeekends.get();
          const target = snap(start, Math.round(count.get()), -e.translationX / colW, -e.velocityX / colW, (sat) => !busy.includes(sat));
          scheduleOnRN(onTarget, target);
          scheduleOnRN(snapTap);
          offset.set(withSpring(target, { ...SWIPE, velocity: -e.velocityX / colW }));
        }),
    [offset, count, busyWeekends, startOffset, panDay, width, onTarget],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          startCount.set(count.get());
          startOffset.set(offset.get());
          pinchDays.set(nearDay(count.get()));
        })
        .onUpdate((e) => {
          // Softly per day while pinching (it still settles on a whole number when you let go)
          const n = Math.max(1, Math.min(MAX_DAYS, pulled(startCount.get(), startCount.get() / e.scale)));
          // The day on the left stays on the left: zooming out shows more days to the right (never further back),
          // zooming in narrows towards that first day
          count.set(n);
          offset.set(startOffset.get());
          if (onNewDay(n, pinchDays)) scheduleOnRN(tick);
        })
        .onEnd(() => {
          const n = Math.max(1, Math.min(MAX_DAYS, Math.round(count.get())));
          const start = Math.round(offset.get());
          count.set(withSpring(n, RESIZE));
          offset.set(withSpring(start, SWIPE));
          scheduleOnRN(onCount, n, start);
          scheduleOnRN(snapTap);
        }),
    [offset, count, startCount, startOffset, pinchDays, onCount],
  );

  // What the grid shows is in `data`, `nowMin` and the size at this render; the tap gesture below is made once and
  // calls this one, which is always the newest
  const tapAt = useStable((x: number, y: number, off: number, n: number) => {
    const day = Math.floor(off + x / (width / n));
    const min = h0 * 60 + ((y - labelH) / pxPerHour) * 60;
    const d = data(day);
    if (!d) return;
    // Vergelijken: a friend's lane has only their classes
    const lane = d.lanes ? laneAt(d.lanes, off + x / (width / n) - day) : null;
    if (lane && lane.who !== null) {
      const hit = lane.lessons.find((l) => l.start <= min && min < l.end);
      if (hit) onPressLesson(hit, day, lane.who);
      return;
    }
    // Lessons side by side: the cell the finger is in (across your own part of the day in Vergelijken)
    const across = off + x / (width / n) - day;
    const mine = d.lanes?.[0];
    const fx = mine ? (across - mine.x0) / (mine.x1 - mine.x0) : across;
    const hits = lessonsIn(d.merged, d.overlaps, min, false, d.place, fx);
    if (hits.length > 1) onPressOverlap(hits, day);
    else if (hits.length === 1) onPressLesson(hits[0], day);
    else {
      // A hatched one (over, or too far ahead) can't be asked for; a shared break over a skipped class goes first;
      // then your own break with nobody (as `DayCache` cut it out of the free gaps), not once it's over
      const s = d.together.find((x) => x.start <= min && min < x.end);
      const skipped = lessonsIn(d.merged, d.overlaps, min, true)[0];
      const alone = d.taps.find((g) => g.kind === TAP_ALONE && g.start <= min && min < g.end);
      if (s && !s.muted && !(day === today && s.end <= nowMin)) onPressTogether(day, { start: s.start, end: s.end });
      else if (skipped) onPressLesson(skipped, day);
      else if (alone && !(day === today && alone.end <= nowMin)) onPressAlone(day, { start: alone.start, end: alone.end });
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
      if (hasDrag) for (const l of d.skippable) if (day > today || (day === today && l.end > nowMin)) drags.push({ day, ...l });
      for (const g of d.taps) if (!((g.kind === TAP_TOGETHER || g.kind === TAP_ALONE) && day === today && g.end <= nowMin)) taps.push(g);
    }
    return { drags, taps };
  }, [data, from, to, today, nowMin, hasDrag]);
  const targets = useDragTargets(lists.drags);
  const tapTargets = useTapTargets(lists.taps);

  // Taps go through the gesture system too (not a Pressable per lesson): a swipe or pinch can never end
  // as a tap on the lesson under your finger, and a double tap is never two taps. The UI thread already knows whether
  // anything under the finger opens a sheet (the stretches in `tapTargets`): a tap on nothing never wakes JS.
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(8)
        .onEnd((e, ok) => {
          if (!ok) return;
          const off = offset.get();
          const n = count.get();
          const day = Math.floor(off + e.x / (width / n));
          const min = h0 * 60 + ((e.y - labelH) / pxPerHour) * 60;
          if (tapKindAt(tapTargets.get(), day, min, off + e.x / (width / n) - day) < 0) return;
          scheduleOnRN(tapAt, e.x, e.y, off, n);
        }),
    [offset, count, tapTargets, width, h0, pxPerHour, labelH, tapAt],
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
    labelH,
    onPick: onPickClass ?? noop,
    onDrop: onDropClass ?? noop,
    enabled: !!drag,
  });

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        // Short: a single tap waits this long to be sure it isn't the first of two
        .maxDelay(200)
        .onEnd((_e, ok) => {
          if (ok) scheduleOnRN(onDoubleTap);
        }),
    [onDoubleTap],
  );

  const gesture = useMemo(() => Gesture.Simultaneous(pinch, Gesture.Exclusive(skip, pan, doubleTap, tap)), [pinch, skip, pan, doubleTap, tap]);

  const days: number[] = [];
  for (let i = from; i <= to; i++) days.push(i);

  return (
    <GestureDetector gesture={gesture}>
      <View className="flex-1 overflow-hidden" style={{ height }}>
        {/* Hour lines: subtle and dotted, behind everything */}
        <LiveBody axis={live} hours={hours} pxPerHour={pxPerHour} labelH={labelH} height={height}>
          <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
            {Array.from({ length: h1 - h0 + 1 }, (_, i) => (
              <Line key={i} x1={0} x2={width} y1={labelH + i * pxPerHour} y2={labelH + i * pxPerHour} stroke={lineColor} strokeWidth={1} strokeDasharray="2 4" />
            ))}
          </Svg>
        </LiveBody>
        {days.map((day) => (
          <DayColumn
            key={day}
            day={day}
            offset={offset}
            count={count}
            width={width}
            height={height}
            pxPerHour={pxPerHour}
            lineColor={lineColor}
            data={data(day)}
            hours={hours}
            today={today}
            nowMin={day === today ? nowMin : null}
            compact={compact}
            lang={lang}
            labelH={labelH}
            view={view}
            axis={live}
            onPressLesson={onPressLesson}
            onPressOverlap={onPressOverlap}
            onPressTogether={onPressTogether}
            onPressAlone={onPressAlone}
          />
        ))}
      </View>
    </GestureDetector>
  );
});

const noop = () => {};

/** `magnet` on a dragged value, starting from where it was: no jump at the first frame when that's between days. */
function pulled(start: number, x: number) {
  'worklet';
  return start + magnet(x) - magnet(start);
}

/** The whole day `v` is on (within `NEAR`), else NaN. */
function nearDay(v: number) {
  'worklet';
  const n = Math.round(v);
  return Math.abs(v - n) < NEAR ? n : NaN;
}

/** True once when `v` reaches a whole day other than the last one (`last`). Half a day away it forgets it, so going
 * back to the same day taps again, but a finger trembling around a day doesn't. */
function onNewDay(v: number, last: SharedValue<number>) {
  'worklet';
  const n = nearDay(v);
  if (Number.isNaN(n)) {
    if (Math.abs(v - last.get()) > 0.5) last.set(NaN);
    return false;
  }
  if (n === last.get()) return false;
  last.set(n);
  return true;
}

type ColumnProps = {
  day: number;
  offset: SharedValue<number>;
  count: SharedValue<number>;
  width: number;
  height: number;
  pxPerHour: number;
  lineColor: string;
  data: DayData | undefined;
  hours: [number, number];
  today: number;
  /** The time of day, for today's column only: the others are not concerned by it (null) and don't render every minute */
  nowMin: number | null;
  compact: boolean;
  lang: Lang;
  labelH: number;
  view: GridView;
  axis: AxisLive;
  onPressLesson: Props['onPressLesson'];
  onPressOverlap: Props['onPressOverlap'];
  onPressTogether: Props['onPressTogether'];
  onPressAlone: Props['onPressAlone'];
};

/**
 * One day. Placed and sized on the UI thread from `offset` and `count`; it re-renders only when its own props change
 * (its data, the hours, the size, the minute on today's column), never because of a swipe: every prop is a number, a
 * string, a shared value, one of the cache's `DayData` objects or a callback that keeps its identity.
 */
const DayColumn = memo(function DayColumn({ day, offset, count, width, height, pxPerHour, lineColor, data, hours, today, nowMin, compact, lang, labelH, view, axis, onPressLesson, onPressOverlap, onPressTogether, onPressAlone }: ColumnProps) {
  noteColumnRender(day);
  const { t } = useT();
  const style = useAnimatedStyle(() => {
    const w = width / count.get();
    return { left: (day - offset.get()) * w, width: w };
  });
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
  const y = (min: number) => labelH + ((min - h0 * 60) / 60) * pxPerHour;
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
  const lanes = data?.lanes;
  const strongLine = String(useCSSVariable('--color-line-strong') ?? '#C9C4B8');
  const me = lanes?.[0];
  // Vergelijken: your lessons and breaks in your lane (left part of the day), each friend in a lane of their own
  const mine = me ? { position: 'absolute' as const, top: 0, bottom: 0, left: `${me.x0 * 100}%` as const, width: `${(me.x1 - me.x0) * 100}%` as const } : { position: 'absolute' as const, top: 0, bottom: 0, left: 0, right: 0 };
  return (
    <AView className="absolute top-0" style={[{ height }, style]}>
      {/* Today: a little brighter than the other days, behind everything */}
      {isToday && !lanes ? <View pointerEvents="none" className="absolute left-0 right-0 bottom-0 bg-surface opacity-70 rounded-t-[8px]" style={{ top: 0 }} /> : null}
      {/* Vergelijken: a checker of lighter and darker lanes (alternating on across the days; lighter still today), each
          person's name on top in their colour, and a darker dashed line between people */}
      {lanes?.map((lane, i) => {
        const light = (day * lanes.length + i) % 2 === 0;
        return (
          <View
            key={`bg:${lane.who ?? 'me'}`}
            pointerEvents="none"
            className={light || isToday ? 'bg-surface' : 'bg-surface-sunken'}
            style={{ position: 'absolute', top: LABEL_H, bottom: 0, left: `${lane.x0 * 100}%`, width: `${(lane.x1 - lane.x0) * 100}%`, opacity: light ? (isToday ? 1 : 0.8) : isToday ? 0.5 : 0.6 }}
          />
        );
      })}
      {lanes?.slice(1).map((lane) => (
        <View key={`sep:${lane.who}`} pointerEvents="none" style={{ position: 'absolute', top: LABEL_H, bottom: 0, left: `${lane.x0 * 100}%`, width: 2, marginLeft: -1 }}>
          <Svg width={2} height={height} pointerEvents="none">
            <Line x1={1} x2={1} y1={0} y2={height} stroke={strongLine} strokeWidth={1.25} strokeDasharray="4 3" />
          </Svg>
        </View>
      ))}
      {lanes?.map((lane) => (
        <View key={`name:${lane.who ?? 'me'}`} pointerEvents="none" className="absolute items-center justify-center px-0.5" style={{ top: LABEL_H, height: NAME_H, left: `${lane.x0 * 100}%`, width: `${(lane.x1 - lane.x0) * 100}%` }}>
          <Text variant="xs" bold numberOfLines={1} tone={lane.who === null ? 'you' : undefined} style={lane.color ? { color: lane.color } : undefined}>
            {lane.name}
          </Text>
        </View>
      ))}
      <Svg width={2} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        <Line x1={1} x2={1} y1={labelH} y2={height} stroke={lineColor} strokeWidth={1} strokeDasharray="2 4" />
      </Svg>
      <View style={{ height: LABEL_H }} className="items-center justify-center">
        <Text variant="xs" bold tone={isToday ? 'you' : day % 7 >= 5 ? 'ink3' : 'ink2'} numberOfLines={1}>
          {`${weekdayShort(date, lang).toLowerCase()} ${date.getDate()}`}
        </Text>
      </View>
      <LiveBody axis={axis} hours={hours} pxPerHour={pxPerHour} labelH={labelH} height={height}>
      <View style={mine} pointerEvents="box-none">
      {me?.empty ? <EmptyLane t={t} top={labelH} /> : null}
      {/* Free moments between lessons: behind everything (a shared break or a cancelled lesson goes over them). A screen
          reader can open "Meestal ga je met:" on one that isn't over (a finger only where no shared break is: `tapAt`) */}
      {free.map((f) => {
        const top = y(Math.max(f.start, h0 * 60));
        const h = Math.max(y(Math.min(f.end, h1 * 60)) - top - 3, 10);
        // `now` is the end of the day on a past day: none of those
        const open = now == null || f.end > now;
        return (
          <AView
            key={`free:${f.start}`}
            entering={entering}
            style={{ position: 'absolute', top, height: h, left: 2, right: 2 }}
            accessible
            accessibilityRole={open ? 'button' : undefined}
            accessibilityLabel={`${t('tt.free')}, ${hhmm(f.start)} ${t('tt.to')} ${hhmm(f.end)}`}
            onAccessibilityTap={open ? () => onPressAlone(day, f) : undefined}
          >
            <View pointerEvents="none" style={{ flex: 1 }}>
              <BlockView block={{ type: 'free', span: f }} style={{ flex: 1 }} compact={compact} t={t} />
            </View>
          </AView>
        );
      })}
      {blocks.map((b) => {
        const s = b.type === 'lesson' ? { start: b.lesson.start, end: b.lesson.end } : 'span' in b ? b.span : { start: 0, end: 0 };
        const top = y(Math.max(s.start, h0 * 60));
        const h = Math.max(y(Math.min(s.end, h1 * 60)) - top - 3, 16);
        const key = b.type === 'lesson' ? `${b.lesson.start}:${b.lesson.course}:${b.lesson.location}` : `${b.type}:${s.start}`;
        // Lessons at the same time: each in its own cell of the column, the width shared evenly
        const slot = b.type === 'lesson' ? b.slot : undefined;
        const place = slot ? { left: `${(slot.i / slot.n) * 100}%` as `${number}%`, width: `${100 / slot.n}%` as `${number}%` } : { left: 2, right: 2 };
        return (
          // Touches go to the grid's tap gesture; screen readers activate the block itself
          <AView
            key={key}
            entering={entering}
            style={{ position: 'absolute', top, height: h, ...place }}
            accessible
            accessibilityRole="button"
            accessibilityLabel={b.type === 'lesson' ? lessonLabel(b.lesson, t) : t('tt.together')}
            onAccessibilityTap={() => (b.type === 'lesson' ? onPressLesson(b.lesson, day) : b.type === 'together' && !b.muted ? onPressTogether(day, s) : undefined)}
          >
            <View pointerEvents="none" style={{ flex: 1, marginHorizontal: slot ? 1 : 0 }}>
              <BlockView block={b} style={{ flex: 1 }} compact={compact} t={t} />
            </View>
          </AView>
        );
      })}
      {/* Too many lessons at the same time to stand side by side: a hatched band over the shared stretch, on top of them */}
      {overlaps.map((o) => {
        const top = y(Math.max(o.start, h0 * 60));
        const h = Math.max(y(Math.min(o.end, h1 * 60)) - top - 3, 6);
        return (
          <AView key={`overlap:${o.start}`} entering={entering} style={{ position: 'absolute', top, height: h, left: 2, right: 2 }} accessible accessibilityRole="button" onAccessibilityTap={() => onPressOverlap(o.lessons, day)}>
            <OverlapBand overlap={o} style={{ flex: 1 }} compact={compact} label={h >= 20} t={t} />
          </AView>
        );
      })}
      </View>
      {lanes?.slice(1).map((lane) => (
        <View key={lane.who} pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, left: `${lane.x0 * 100}%`, width: `${(lane.x1 - lane.x0) * 100}%` }}>
          {lane.empty ? <EmptyLane t={t} hidden={lane.hidden} top={labelH} /> : <FriendLane lane={lane} y={y} h0={h0} h1={h1} now={now} compact={compact} entering={entering} t={t} />}
        </View>
      ))}
      {data?.loading && blocks.length === 0 ? (
        <AView entering={calm ? undefined : FadeIn} className="absolute left-1 right-1 gap-2" style={{ top: y(h0 * 60 + 60) }} pointerEvents="none">
          <Skeleton className="h-14 rounded-block" />
          <Skeleton className="h-9 rounded-block" />
          <Skeleton className="h-16 rounded-block" />
        </AView>
      ) : null}
      {isToday && nowMin != null && nowMin >= h0 * 60 && nowMin <= h1 * 60 ? (
        <View className="absolute left-0 right-0 h-0.5 bg-ink" style={{ top: y(nowMin) }} pointerEvents="none">
          <View className="absolute bg-ink rounded-full w-2 h-2" style={{ left: -3, top: -3 }} />
        </View>
      ) : null}
      </LiveBody>
    </AView>
  );
});

/**
 * What is laid out in whole hours (the hour lines, a day's lessons and lanes, the 'now' line) while you drag the axis:
 * scaled and moved on the UI thread to the live hours (`axis`, fractions of an hour), so the grid follows your finger
 * a pixel at a time instead of jumping an hour. The scale is exact for positions and heights (time is linear on the
 * grid); text is stretched a few percent at most, since the layout is redone at the nearest whole hour. Clipped to
 * below the dates, which stay where they are. Without a drag it is the identity.
 */
function LiveBody({ axis, hours, pxPerHour, labelH, height, children }: { axis: AxisLive; hours: [number, number]; pxPerHour: number; labelH: number; height: number; children: ReactNode }) {
  const [h0, h1] = hours;
  const style = useAnimatedStyle(() => {
    if (!axis.on.get()) return { transform: [{ translateY: 0 }, { scaleY: 1 }] };
    const a = axis.a.get();
    const s = (h1 - h0) / (axis.b.get() - a);
    return { transform: [{ translateY: s * (h0 - a) * pxPerHour }, { scaleY: s }] };
  });
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: labelH, bottom: 0, overflow: 'hidden' }}>
      <AView pointerEvents="box-none" style={[{ position: 'absolute', left: 0, right: 0, top: -labelH, height, transformOrigin: `0px ${labelH}px` }, style]}>
        {children}
      </AView>
    </View>
  );
}

/** A lane with nothing on it that day (Vergelijken): narrow, 'Leeg' in the middle ('Verborgen' when they hide it) */
function EmptyLane({ t, hidden = false, top }: { t: (k: Key) => string; hidden?: boolean; top: number }) {
  return (
    <View pointerEvents="none" className="absolute left-0 right-0 bottom-0 items-center justify-center" style={{ top }}>
      <Text variant="xs" bold tone="ink3" numberOfLines={2} className="text-center px-0.5">
        {t(hidden ? 'status.hidden' : 'compare.empty')}
      </Text>
    </View>
  );
}
