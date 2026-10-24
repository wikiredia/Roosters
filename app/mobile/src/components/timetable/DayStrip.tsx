import { useEffect } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { type SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AView } from '@/components/ui/Motion';
import { Text } from '@/components/ui/Text';
import { type Lang, useT } from '@/i18n';
import { dateAt, MAX_DAYS, snap } from '@/lib/days';
import { shortDate, weekdayShort } from '@/lib/time';

import { RESIZE, SWIPE } from './DayGrid';
import { KIND_DOT, type LessonKind } from './Timetable';

const H = 56;

type Props = {
  /** Shared with the grid: the left edge of what you see (days), how many days, and where in the strip that
   * first day sits (0 = the strip's first cell). The strip shows offset - k … offset - k + 7. */
  offset: SharedValue<number>;
  count: SharedValue<number>;
  /** The number of days as React knows it (for the screen reader label: render never reads `count`) */
  n: number;
  k: SharedValue<number>;
  /** Saturdays of weekends with something on them (as in the grid: a swipe doesn't skip those). */
  busyWeekends: SharedValue<number[]>;
  width: number;
  from: number;
  to: number;
  today: number;
  lang: Lang;
  /** The kinds of lessons on a day: a small dot each under the date. */
  kinds: (day: number) => LessonKind[];
  onPick: (day: number) => void;
  /** Where a swipe of the strip will land (as the grid's `onTarget`). */
  onTarget: (start: number) => void;
  /** Every time the handle covers another number of days, and when it's let go (with the first day: dragged
   * left past it, the first day goes back with the finger). */
  onResize: (n: number) => void;
  onResizeEnd: (n: number, start?: number) => void;
  /** First time: the dash wiggles to show it can be dragged. */
  nudge?: boolean;
};

/**
 * The week above the timetable, seven equal cells. What you see in the grid is a white cell (the first day) with
 * a grey band stretching out of it; the dash on the band's edge sets how many days you see (1–7), live: the
 * grid's columns get thinner or wider with your finger and settle with a bounce. Drag the dash left past the white
 * cell and that first day follows your finger: the grid goes back a few days. The strip and the grid move as one:
 * swipe either and the other follows. Under each date a small dot per kind of lesson that day. Tap a day to start there.
 */
export function DayStrip({ offset, count, n, k, busyWeekends, width, from, to, today, lang, kinds, onPick, onTarget, onResize, onResizeEnd, nudge }: Props) {
  const { t } = useT();
  const cell = width / 7;
  const startCount = useSharedValue(1);
  const startK = useSharedValue(0);
  const startOffset = useSharedValue(0);
  const pulled = useSharedValue(false);
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
      startOffset.set(offset.get());
      pulled.set(false);
      last.set(Math.round(count.get()));
    })
    .onUpdate((e) => {
      let live = startCount.get() + e.translationX / cell;
      if (live < 1) {
        // Past the first day: one day, and that day follows your finger back in time (the white cell slides
        // left; at the strip's edge the dates slide right under it instead)
        const back = 1 - live;
        count.set(1);
        k.set(Math.max(0, startK.get() - back));
        offset.set(startOffset.get() - back);
        pulled.set(true);
        live = 1;
      } else {
        // Rubber band past 7
        if (live > MAX_DAYS) live = MAX_DAYS + (live - MAX_DAYS) / 4;
        count.set(live);
        if (pulled.get()) {
          offset.set(startOffset.get());
          pulled.set(false);
        }
        // The band stays inside the strip: when it grows past Sunday the dates slide left under it
        k.set(Math.max(0, Math.min(startK.get(), 7 - live)));
      }
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
      if (pulled.get()) {
        const start = Math.round(offset.get());
        offset.set(withSpring(start, SWIPE));
        scheduleOnRN(onResizeEnd, days, start);
      } else scheduleOnRN(onResizeEnd, days, undefined);
    });

  // Swiping the strip itself scrolls the days (the grid follows): the dates move with your finger under the band
  const swipe = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      startOffset.set(offset.get());
    })
    .onUpdate((e) => {
      offset.set(startOffset.get() - e.translationX / cell);
    })
    .onEnd((e) => {
      const start = Math.round(startOffset.get());
      const busy = busyWeekends.get();
      const target = snap(start, Math.round(count.get()), -e.translationX / cell, -e.velocityX / cell, (sat) => !busy.includes(sat));
      scheduleOnRN(onTarget, target);
      offset.set(withSpring(target, { ...SWIPE, velocity: -e.velocityX / cell }));
    });
  // Taps through the gesture system too: a swipe never ends as a tap on the day under your finger
  const tap = Gesture.Tap()
    .maxDistance(8)
    .onEnd((e, ok) => {
      if (ok) scheduleOnRN(onPick, Math.floor(offset.get() - k.get() + e.x / cell));
    });
  // The dash wins over the strip's own swipe
  pan.blocksExternalGesture(swipe, tap);

  const days: number[] = [];
  for (let i = from; i <= to; i++) days.push(i);

  return (
    <GestureDetector gesture={Gesture.Exclusive(swipe, tap)}>
      <View className="overflow-hidden" style={{ height: H }} accessibilityLabel={t('rooster.stripLabel', { n })}>
        {width ? (
          <>
            <AView className="absolute top-0 bottom-0 rounded-chip bg-surface-sunken" style={band} pointerEvents="none" />
            <AView className="absolute top-0 bottom-0 rounded-chip bg-surface border border-line" style={white} pointerEvents="none" />
            <AView className="absolute top-0 bottom-0 left-0" style={dates}>
              {days.map((day) => {
                const d = dateAt(day);
                const weekend = day % 7 >= 5;
                const dots = kinds(day);
                return (
                  // Touches go to the strip's tap gesture; screen readers activate the day itself
                  <View
                    key={day}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={shortDate(d, lang)}
                    onAccessibilityTap={() => onPick(day)}
                    className="absolute top-0 bottom-0 items-center justify-center"
                    style={{ left: (day - from) * cell, width: cell }}
                  >
                    <Text variant="xs" bold tone={weekend ? 'ink3' : 'ink2'}>
                      {weekdayShort(d, lang)}
                    </Text>
                    <Text bold tone={day === today ? 'you' : weekend ? 'ink3' : 'ink'}>
                      {d.getDate()}
                    </Text>
                    {dots.length ? (
                      <View className="absolute bottom-1.5 flex-row gap-[3px]" pointerEvents="none">
                        {dots.map((kind) => (
                          <View key={kind} className={`w-[5px] h-[5px] rounded-full ${KIND_DOT[kind]}`} />
                        ))}
                      </View>
                    ) : null}
                  </View>
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
    </GestureDetector>
  );
}
