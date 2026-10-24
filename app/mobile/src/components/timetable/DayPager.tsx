import { type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AView, enter, SETTLE } from '@/components/ui/Motion';
import { type Page, isWeekend, nextPage, prevPage, samePage } from '@/lib/days';
import { isoDay } from '@/lib/time';

type Props = {
  page: Page;
  /** How many days you want side by side (pages at the end of a week can have fewer). */
  want: number;
  onChange: (p: Page) => void;
  renderPage: (p: Page, current: boolean) => ReactNode;
};

/** A swipe shorter than this (and slow) springs back. */
const MIN_SWIPE = 0.12;
/** Longer than this, or a flick: a big swipe, past the weekend. */
const BIG_SWIPE = 0.5;
const FLICK = 900;

const keyOf = (p: Page) => `${isoDay(p.start)}:${p.n}`;

/**
 * Swipe through time, page by page, as far back or ahead as you like. A short swipe goes one page (so
 * after Friday you see the weekend); a long swipe or a flick lands on the next school days, flying past
 * the weekend. Pages are laid out at absolute positions (`base`), so when a swipe ends nothing jumps or
 * is rebuilt: the page you landed on is already where it should be, with its data.
 */
export function DayPager({ page, want, onChange, renderPage }: Props) {
  const [width, setWidth] = useState(0);
  const [base, setBase] = useState(0);
  const x = useSharedValue(0);
  const start = useSharedValue(0);

  // Neighbours: one page each side, two when the first one is a weekend (a big swipe skips it)
  const n1 = nextPage(page, want);
  const p1 = prevPage(page, want);
  const slots: { k: number; p: Page }[] = [{ k: -1, p: p1 }, { k: 0, p: page }, { k: 1, p: n1 }];
  const weekday = !isWeekend(page.start);
  if (weekday && isWeekend(n1.start)) slots.push({ k: 2, p: nextPage(n1, want) });
  if (weekday && isWeekend(p1.start)) slots.unshift({ k: -2, p: prevPage(p1, want) });

  // Jumped from outside (a tap on the strip, Today): stay where we are, the new page is at `base`
  useEffect(() => {
    if (width) x.set(-base * width);
  }, [width]);

  function land(k: number) {
    const target = slots.find((s) => s.k === k)?.p;
    if (!target) return;
    setBase((b) => b + k);
    onChange(target);
  }

  const has2 = slots.some((s) => s.k === 2);
  const hasM2 = slots.some((s) => s.k === -2);
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      start.set(x.get());
    })
    .onUpdate((e) => {
      x.set(start.get() + e.translationX);
    })
    .onEnd((e) => {
      const here = -base * width;
      const dx = e.translationX;
      const dist = Math.abs(dx) / Math.max(width, 1);
      const dir = dx < 0 ? 1 : -1;
      let k = 0;
      if (dist > MIN_SWIPE || Math.abs(e.velocityX) > 300) {
        k = dir;
        const big = dist > BIG_SWIPE || Math.abs(e.velocityX) > FLICK;
        if (big && ((dir === 1 && has2) || (dir === -1 && hasM2))) k = 2 * dir;
      }
      x.set(
        withSpring(here - k * width, { ...SETTLE, velocity: e.velocityX }, (done) => {
          if (done && k !== 0) scheduleOnRN(land, k);
        }),
      );
    });

  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <GestureDetector gesture={pan}>
      <View className="flex-1 overflow-hidden" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width ? (
          <AView className="flex-1" style={strip}>
            {slots.map(({ k, p }) => (
              // A page that's new here fades in (a tap on another day, Today); swiped pages are already there
              <AView key={keyOf(p)} entering={enter} className="absolute top-0 bottom-0" style={{ left: (base + k) * width, width }}>
                {renderPage(p, samePage(p, page))}
              </AView>
            ))}
          </AView>
        ) : null}
      </View>
    </GestureDetector>
  );
}
