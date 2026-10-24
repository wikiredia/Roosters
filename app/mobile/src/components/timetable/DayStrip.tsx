import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AView, SETTLE } from '@/components/ui/Motion';
import { Text } from '@/components/ui/Text';
import { type Lang, useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { type Page, segment, weekday } from '@/lib/days';
import { addDays, isoDay, monday, shortDate, weekdayShort } from '@/lib/time';

const GAP = 4;
/** Weekend cells are narrower: they're there, but the week is what counts. */
const WEEKEND = 0.62;
/** The handle settles with a little bounce. */
const BOUNCE = { damping: 13, stiffness: 260, mass: 0.7 };

type Props = {
  page: Page;
  /** Tap on a day: start the page there. */
  onPick: (day: Date) => void;
  /** While dragging the handle, every time it covers another number of days. */
  onResize: (n: number) => void;
  lang: Lang;
  /** First time: the handle nudges to show it can be dragged. */
  nudge?: boolean;
};

/** Cell positions (x, width) of Mon … Sun for a strip `w` wide. */
function cells(w: number) {
  const unit = (w - GAP * 6) / (5 + 2 * WEEKEND);
  const out: { x: number; w: number }[] = [];
  let x = 0;
  for (let i = 0; i < 7; i++) {
    const cw = i < 5 ? unit : unit * WEEKEND;
    out.push({ x, w: cw });
    x += cw + GAP;
  }
  return out;
}

/**
 * The week above the timetable: Mon … Sun with their dates. The first day of what you see is a white
 * rectangle; the other days you see are a grey one stretching out of it, with a little dash on its right
 * edge. Drag the dash over more (or fewer) days to see that many side by side (1–5, never past Friday or
 * Sunday); it follows your finger and settles with a bounce. Tap a day to start there.
 */
export function DayStrip({ page, onPick, onResize, lang, nudge }: Props) {
  const { t } = useT();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const weekStart = monday(page.start).getTime();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(weekStart), i)), [weekStart]);
  const geo = useMemo(() => cells(width), [width]);
  const first = weekday(page.start);
  // How many days the handle can cover from here: up to Friday on a school day, Sunday at the weekend
  const room = Math.min(5, weekday(segment(page.start).end) - first + 1);
  const todayIso = isoDay(new Date());

  const left = useSharedValue(0);
  const white = useSharedValue(0);
  const span = useSharedValue(0);
  const startSpan = useSharedValue(0);
  const nudgeX = useSharedValue(0);
  const dragging = useSharedValue(false);
  const currentN = useSharedValue(page.n);
  const placed = useRef(false);

  const spanOf = (n: number) => (geo.length ? geo[first + n - 1].x + geo[first + n - 1].w - geo[first].x : 0);

  useEffect(() => {
    if (!width) return;
    const to = { l: geo[first].x, w: geo[first].w, s: spanOf(page.n) };
    currentN.set(page.n);
    if (reduced || !placed.current) {
      placed.current = true;
      left.set(to.l);
      white.set(to.w);
      span.set(to.s);
    } else {
      left.set(withSpring(to.l, SETTLE));
      white.set(withSpring(to.w, SETTLE));
      // While the finger holds the handle, the finger decides the width
      if (!dragging.get()) span.set(withSpring(to.s, BOUNCE));
    }
  }, [width, first, page.n, weekStart]);

  useEffect(() => {
    if (!nudge || reduced) {
      cancelAnimation(nudgeX);
      nudgeX.set(withTiming(0));
      return;
    }
    // A small "pull me" every couple of seconds
    nudgeX.set(withRepeat(withSequence(withTiming(0, { duration: 1400 }), withSpring(10, { damping: 8, stiffness: 300 }), withSpring(0, BOUNCE)), -1));
  }, [nudge, reduced]);

  // Ends of each count, for the worklet: covering more than half of the next day counts as that day
  const stops = useMemo(() => Array.from({ length: room }, (_, i) => spanOf(i + 1)), [geo, first, room]);

  const pan = Gesture.Pan()
    .hitSlop({ left: 16, right: 16, top: 12, bottom: 12 })
    .activeOffsetX([-4, 4])
    .onBegin(() => {
      dragging.set(true);
      startSpan.set(span.get());
    })
    .onUpdate((e) => {
      const min = stops[0];
      const max = stops[stops.length - 1];
      let w = startSpan.get() + e.translationX;
      // Rubber band past the ends
      if (w < min) w = min - (min - w) / 4;
      if (w > max) w = max + (w - max) / 4;
      span.set(w);
      let n = 1;
      for (let i = 1; i < stops.length; i++) if (w > (stops[i - 1] + stops[i]) / 2) n = i + 1;
      if (n !== currentN.get()) {
        currentN.set(n);
        scheduleOnRN(onResize, n);
      }
    })
    .onFinalize(() => {
      dragging.set(false);
      span.set(withSpring(stops[currentN.get() - 1] ?? stops[0], BOUNCE));
    });

  const whiteStyle = useAnimatedStyle(() => ({ left: left.get(), width: white.get() }));
  const spanStyle = useAnimatedStyle(() => ({ left: left.get(), width: span.get() }));
  const handleStyle = useAnimatedStyle(() => ({ left: left.get() + span.get() - 22, transform: [{ translateX: nudgeX.get() }] }));

  return (
    <View
      className="h-14"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={t('rooster.stripLabel', { n: page.n })}
    >
      {width ? (
        <>
          <AView className="absolute top-0 bottom-0 rounded-chip bg-surface-sunken" style={spanStyle} pointerEvents="none" />
          <AView className="absolute top-0 bottom-0 rounded-chip bg-surface border border-line" style={whiteStyle} pointerEvents="none" />
        </>
      ) : null}
      <View className="flex-row h-14" style={{ gap: GAP }}>
        {days.map((d, i) => {
          const on = i >= first && i < first + page.n;
          const today = isoDay(d) === todayIso;
          return (
            <Pressable
              key={isoDay(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={shortDate(d, lang)}
              onPress={() => onPick(d)}
              className="items-center justify-center rounded-chip"
              style={{ flex: i < 5 ? 1 : WEEKEND }}
            >
              <Text variant="xs" bold tone={on ? 'ink2' : 'ink3'}>
                {weekdayShort(d, lang)}
              </Text>
              <Text bold tone={today ? 'you' : on ? 'ink' : i >= 5 ? 'ink3' : 'ink2'}>
                {d.getDate()}
              </Text>
              {today ? <View className={cn('absolute bottom-1.5 w-1 h-1 rounded-full bg-you')} /> : null}
            </Pressable>
          );
        })}
      </View>
      {width && room > 1 ? (
        <GestureDetector gesture={pan}>
          <AView
            className="absolute top-0 bottom-0 w-[22px] items-center justify-center"
            style={handleStyle}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t('rooster.handle')}
            accessibilityValue={{ min: 1, max: room, now: page.n }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => onResize(Math.max(1, Math.min(room, page.n + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
          >
            <View className="w-1 h-6 rounded-full bg-ink-3" />
          </AView>
        </GestureDetector>
      ) : null}
    </View>
  );
}
