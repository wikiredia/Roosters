import { memo } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { FadeIn, FadeInLeft, FadeInRight, type SharedValue, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import { scheduleOnRN } from 'react-native-worklets';

import type { Lesson } from '@/api/types';
import { AView, layout } from '@/components/ui/Motion';
import { Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { type Lang, useT } from '@/i18n';
import { dateAt, MAX_DAYS, snap } from '@/lib/days';
import { hhmm, weekdayShort } from '@/lib/time';

import { type Block, BlockView, dayBlocks, freeGaps, lessonLabel, lessonsAt, OverlapBand, overlapsOf, type Span, type TogetherSlot } from './Timetable';

/** Height of the date above each column. */
export const LABEL_H = 22;
/** Swipes settle calmly: no bouncing back and forth through days. */
export const SWIPE = { damping: 28, stiffness: 230, mass: 1 };
/** The number of days settles with a little bounce. */
export const RESIZE = { damping: 16, stiffness: 240, mass: 0.8 };

export type DayData = { lessons: Lesson[]; together: TogetherSlot[]; loading: boolean };

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
  data: (day: number) => DayData | undefined;
  hours: [number, number];
  today: number;
  nowMin: number;
  /** Which side new lessons come from (the direction you went). */
  enterFrom: 1 | -1;
  /** Short course names (narrow columns). */
  compact: boolean;
  lang: Lang;
  onPressLesson: (l: Lesson, day: number) => void;
  /** A tap on (or close to) lessons that overlap: the screen asks which one you mean */
  onPressOverlap: (ls: Lesson[], day: number) => void;
  /** A tap on a shared break: that day and the break (the screen asks "Pauze samen?") */
  onPressTogether: (day: number, span: Span) => void;
  /** Where a swipe will land: called as the finger lets go, so dates and data update before it gets there. */
  onTarget: (start: number) => void;
  /** Pinch: how many days you see (live while pinching is the shared `count`). */
  onCount: (n: number, start: number) => void;
  onDoubleTap: () => void;
};

/**
 * The days side by side, as one continuous strip you scroll through with your finger (day by day, see
 * `days.snap`), as far back or ahead as you like. Every column is placed from the shared `offset` and `count`
 * on the UI thread, so the strip above, the columns and their widths move together in the same frame:
 * dragging the strip's handle or pinching makes the columns thinner while the next days slide in from the side.
 * Double tap zooms the hours in on your lessons (the screen decides); pinch shows more or fewer days.
 * Memo: give it stable callbacks (Calendar does), so opening a sheet doesn't re-render every column.
 */
export const DayGrid = memo(function DayGrid(p: Props) {
  const { offset, count, busyWeekends, width, height, from, to } = p;
  const lineColor = String(useCSSVariable('--color-line') ?? '#E4E1DA');
  const [h0, h1] = p.hours;
  const pxPerHour = (height - LABEL_H) / Math.max(1, h1 - h0);
  const startOffset = useSharedValue(0);
  const startCount = useSharedValue(1);
  const focal = useSharedValue(0);

  const pan = Gesture.Pan()
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
      scheduleOnRN(p.onTarget, target);
      offset.set(withSpring(target, { ...SWIPE, velocity: -e.velocityX / colW }));
    });

  const pinch = Gesture.Pinch()
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
      scheduleOnRN(p.onCount, n, start);
    });

  // Taps go through the gesture system too (not a Pressable per lesson): a swipe or pinch can never end
  // as a tap on the lesson under your finger, and a double tap is never two taps
  const tapAt = (x: number, y: number, off: number, n: number) => {
    const day = Math.floor(off + x / (width / n));
    const min = h0 * 60 + ((y - LABEL_H) / pxPerHour) * 60;
    const d = p.data(day);
    const hits = lessonsAt(d?.lessons ?? [], min);
    if (hits.length > 1) p.onPressOverlap(hits, day);
    else if (hits.length === 1) p.onPressLesson(hits[0], day);
    else {
      // A hatched one (over, or too far ahead) can't be asked for
      const s = d?.together.find((x) => x.start <= min && min < x.end);
      if (s && !s.muted) p.onPressTogether(day, { start: s.start, end: s.end });
    }
  };
  const tap = Gesture.Tap()
    .maxDistance(8)
    .onEnd((e, ok) => {
      if (ok) scheduleOnRN(tapAt, e.x, e.y, offset.get(), count.get());
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    // Short: a single tap waits this long to be sure it isn't the first of two
    .maxDelay(200)
    .onEnd((_e, ok) => {
      if (ok) scheduleOnRN(p.onDoubleTap);
    });

  const days: number[] = [];
  for (let i = from; i <= to; i++) days.push(i);

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, Gesture.Exclusive(pan, doubleTap, tap))}>
      <View className="flex-1 overflow-hidden" style={{ height }}>
        {/* Hour lines: subtle and dotted, behind everything */}
        <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
          {Array.from({ length: h1 - h0 + 1 }, (_, i) => (
            <Line key={i} x1={0} x2={width} y1={LABEL_H + i * pxPerHour} y2={LABEL_H + i * pxPerHour} stroke={lineColor} strokeWidth={1} strokeDasharray="2 4" />
          ))}
        </Svg>
        {days.map((day) => (
          <DayColumn key={day} {...p} day={day} pxPerHour={pxPerHour} lineColor={lineColor} data={p.data(day)} />
        ))}
      </View>
    </GestureDetector>
  );
});

type ColumnProps = Omit<Props, 'data' | 'from' | 'to'> & { day: number; pxPerHour: number; lineColor: string; data: DayData | undefined };

/** One day. Placed and sized on the UI thread from `offset` and `count`; its blocks only re-render when its data changes. */
const DayColumn = memo(function DayColumn({ day, offset, count, width, height, pxPerHour, lineColor, data, hours, today, nowMin, enterFrom, compact, lang, onPressLesson, onPressOverlap, onPressTogether }: ColumnProps) {
  const { t } = useT();
  const style = useAnimatedStyle(() => {
    const w = width / count.get();
    return { left: (day - offset.get()) * w, width: w };
  });
  const date = dateAt(day);
  const isToday = day === today;
  const [h0, h1] = hours;
  const blocks: Block[] = data ? dayBlocks(data.lessons, data.together, day === today ? nowMin : day < today ? 24 * 60 : null) : [];
  const overlaps = data ? overlapsOf(data.lessons) : [];
  const free = data ? freeGaps(data.lessons) : [];
  const y = (min: number) => LABEL_H + ((min - h0 * 60) / 60) * pxPerHour;
  const entering = (enterFrom > 0 ? FadeInRight : FadeInLeft).duration(240);
  return (
    <AView className="absolute top-0" style={[{ height }, style]}>
      <Svg width={2} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        <Line x1={1} x2={1} y1={LABEL_H} y2={height} stroke={lineColor} strokeWidth={1} strokeDasharray="2 4" />
      </Svg>
      <View style={{ height: LABEL_H }} className="items-center justify-center">
        <Text variant="xs" bold tone={isToday ? 'you' : day % 7 >= 5 ? 'ink3' : 'ink2'} numberOfLines={1}>
          {`${weekdayShort(date, lang).toLowerCase()} ${date.getDate()}`}
        </Text>
      </View>
      {/* Free moments between lessons: behind everything (a shared break or a cancelled lesson goes over them) */}
      {free.map((f) => {
        const top = y(Math.max(f.start, h0 * 60));
        const h = Math.max(y(Math.min(f.end, h1 * 60)) - top - 3, 10);
        return (
          <AView
            key={`free:${f.start}`}
            entering={entering}
            layout={layout}
            style={{ position: 'absolute', top, height: h, left: 2, right: 2 }}
            accessible
            accessibilityLabel={`${t('tt.free')}, ${hhmm(f.start)} ${t('tt.to')} ${hhmm(f.end)}`}
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
        return (
          // Touches go to the grid's tap gesture; screen readers activate the block itself
          <AView
            key={key}
            entering={entering}
            layout={layout}
            style={{ position: 'absolute', top, height: h, left: 2, right: 2 }}
            accessible
            accessibilityRole="button"
            accessibilityLabel={b.type === 'lesson' ? lessonLabel(b.lesson, t) : t('tt.together')}
            onAccessibilityTap={() => (b.type === 'lesson' ? onPressLesson(b.lesson, day) : b.type === 'together' && !b.muted ? onPressTogether(day, s) : undefined)}
          >
            <View pointerEvents="none" style={{ flex: 1 }}>
              <BlockView block={b} style={{ flex: 1 }} compact={compact} t={t} />
            </View>
          </AView>
        );
      })}
      {/* Lessons at the same time: a hatched band over the shared stretch, on top of both blocks */}
      {overlaps.map((o) => {
        const top = y(Math.max(o.start, h0 * 60));
        const h = Math.max(y(Math.min(o.end, h1 * 60)) - top - 3, 6);
        return (
          <AView key={`overlap:${o.start}`} entering={entering} layout={layout} style={{ position: 'absolute', top, height: h, left: 2, right: 2 }} accessible accessibilityRole="button" onAccessibilityTap={() => onPressOverlap(o.lessons, day)}>
            <OverlapBand overlap={o} style={{ flex: 1 }} compact={compact} label={h >= 20} t={t} />
          </AView>
        );
      })}
      {data?.loading && blocks.length === 0 ? (
        <AView entering={FadeIn} className="absolute left-1 right-1 gap-2" style={{ top: y(h0 * 60 + 60) }} pointerEvents="none">
          <Skeleton className="h-14 rounded-block" />
          <Skeleton className="h-9 rounded-block" />
          <Skeleton className="h-16 rounded-block" />
        </AView>
      ) : null}
      {isToday && nowMin >= h0 * 60 && nowMin <= h1 * 60 ? (
        <View className="absolute left-0 right-0 h-0.5 bg-ink" style={{ top: y(nowMin) }} pointerEvents="none">
          <View className="absolute bg-ink rounded-full w-2 h-2" style={{ left: -3, top: -3 }} />
        </View>
      ) : null}
    </AView>
  );
});
