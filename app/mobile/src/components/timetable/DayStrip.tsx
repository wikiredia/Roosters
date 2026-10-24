import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { type SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AView } from '@/components/ui/Motion';
import { Text } from '@/components/ui/Text';
import { type Lang, useT } from '@/i18n';
import { dateAt, MAX_DAYS } from '@/lib/days';
import { shortDate, weekdayShort } from '@/lib/time';

import { RESIZE } from './DayGrid';

const H = 56;

type Props = {
  /** Shared with the grid: the left edge of what you see (days), how many days, and where in the strip that
   * first day sits (0 = the strip's first cell). The strip shows offset - k … offset - k + 7. */
  offset: SharedValue<number>;
  count: SharedValue<number>;
  /** The number of days as React knows it (for the screen reader label: render never reads `count`) */
  n: number;
  k: SharedValue<number>;
  width: number;
  from: number;
  to: number;
  today: number;
  lang: Lang;
  onPick: (day: number) => void;
  /** Every time the handle covers another number of days, and when it's let go. */
  onResize: (n: number) => void;
  onResizeEnd: (n: number) => void;
  /** First time: the dash wiggles to show it can be dragged. */
  nudge?: boolean;
};

/**
 * The week above the timetable, seven equal cells. What you see in the grid is a white cell (the first day) with
 * a grey band stretching out of it; the dash on the band's edge sets how many days you see (1–7), live: the
 * grid's columns get thinner or wider with your finger and settle with a bounce. It follows the grid exactly:
 * swipe the timetable a day and the dates under the band move a day. Tap a day to start there.
 */
export function DayStrip({ offset, count, n, k, width, from, to, today, lang, onPick, onResize, onResizeEnd, nudge }: Props) {
  const { t } = useT();
  const cell = width / 7;
  const startCount = useSharedValue(1);
  const startK = useSharedValue(0);
  const last = useSharedValue(0);

  const dates = useAnimatedStyle(() => ({ transform: [{ translateX: (from - (offset.get() - k.get())) * cell }] }));
  const white = useAnimatedStyle(() => ({ left: k.get() * cell, width: cell }));
  const band = useAnimatedStyle(() => ({ left: k.get() * cell, width: count.get() * cell }));
  const handle = useAnimatedStyle(() => ({ left: (k.get() + count.get()) * cell - 22 }));
  const wiggle = useSharedValue(0);
  const dash = useAnimatedStyle(() => ({ transform: [{ translateX: wiggle.get() }] }));
  useEffect(() => {
    wiggle.set(nudge ? withRepeat(withSequence(withTiming(0, { duration: 1400 }), withSpring(9, { damping: 8, stiffness: 300 }), withSpring(0, RESIZE)), -1) : withTiming(0));
  }, [nudge, wiggle]);

  const pan = Gesture.Pan()
    .hitSlop({ left: 16, right: 16, top: 10, bottom: 10 })
    .activeOffsetX([-4, 4])
    .onBegin(() => {
      startCount.set(count.get());
      startK.set(k.get());
      last.set(Math.round(count.get()));
    })
    .onUpdate((e) => {
      let live = startCount.get() + e.translationX / cell;
      // Rubber band past 1 and 7
      if (live < 1) live = 1 - (1 - live) / 4;
      if (live > MAX_DAYS) live = MAX_DAYS + (live - MAX_DAYS) / 4;
      count.set(live);
      // The band stays inside the strip: when it grows past Sunday the dates slide left under it
      k.set(Math.max(0, Math.min(startK.get(), 7 - live)));
      const r = Math.max(1, Math.min(MAX_DAYS, Math.round(live)));
      if (r !== last.get()) {
        last.set(r);
        scheduleOnRN(onResize, r);
      }
    })
    .onFinalize(() => {
      const days = Math.max(1, Math.min(MAX_DAYS, Math.round(count.get())));
      count.set(withSpring(days, RESIZE));
      k.set(withSpring(Math.max(0, Math.min(Math.round(k.get()), 7 - days)), RESIZE));
      scheduleOnRN(onResizeEnd, days);
    });

  const days: number[] = [];
  for (let i = from; i <= to; i++) days.push(i);

  return (
    <View className="overflow-hidden" style={{ height: H }} accessibilityLabel={t('rooster.stripLabel', { n })}>
      {width ? (
        <>
          <AView className="absolute top-0 bottom-0 rounded-chip bg-surface-sunken" style={band} pointerEvents="none" />
          <AView className="absolute top-0 bottom-0 rounded-chip bg-surface border border-line" style={white} pointerEvents="none" />
          <AView className="absolute top-0 bottom-0 left-0" style={dates}>
            {days.map((day) => {
              const d = dateAt(day);
              const weekend = day % 7 >= 5;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={shortDate(d, lang)}
                  onPress={() => onPick(day)}
                  className="absolute top-0 bottom-0 items-center justify-center"
                  style={{ left: (day - from) * cell, width: cell }}
                >
                  <Text variant="xs" bold tone={weekend ? 'ink3' : 'ink2'}>
                    {weekdayShort(d, lang)}
                  </Text>
                  <Text bold tone={day === today ? 'you' : weekend ? 'ink3' : 'ink'}>
                    {d.getDate()}
                  </Text>
                  {day === today ? <View className="absolute bottom-1.5 w-1 h-1 rounded-full bg-you" /> : null}
                </Pressable>
              );
            })}
          </AView>
          <GestureDetector gesture={pan}>
            <AView
              className="absolute top-0 bottom-0 w-[22px] items-center justify-center"
              style={handle}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={t('rooster.handle')}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => {
                const next = Math.max(1, Math.min(MAX_DAYS, n + (e.nativeEvent.actionName === 'increment' ? 1 : -1)));
                count.set(withSpring(next, RESIZE));
                onResizeEnd(next);
              }}
            >
              <AView className="w-1 h-6 rounded-full bg-ink-3" style={dash} />
            </AView>
          </GestureDetector>
        </>
      ) : null}
    </View>
  );
}
