import { memo, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon } from '@/components/ui/Icon';
import { AView, enter, exit } from '@/components/ui/Motion';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { prefs } from '@/lib/storage';

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
const MARGIN = 10;
const W = 112;
const H = 40;
/** Settles in its corner with a small bounce. */
const SNAP = { damping: 15, stiffness: 210, mass: 0.8 };

const saveCorner = (c: Corner) => prefs.set('today.corner', c);

function cornerXY(c: Corner, w: number, h: number, top: number) {
  'worklet';
  return { x: c[1] === 'l' ? MARGIN : w - W - MARGIN, y: c[0] === 't' ? top + MARGIN : h - H - MARGIN };
}

/**
 * 'Vandaag' floating over the timetable when you're looking at another week, a little see-through: tap to go back (the timetable slides
 * there from where you were). Drag it anywhere; it settles in the nearest corner with a little bounce, and stays
 * in that corner next time (`prefs` `today.corner`).
 */
export const TodayPill = memo(function TodayPill({ width, height, top, onPress }: { width: number; height: number; top: number; onPress: () => void }) {
  const { t } = useT();
  const x = useSharedValue(width - W - MARGIN);
  const y = useSharedValue(height - H - MARGIN);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);

  useEffect(() => {
    prefs.get<Corner>('today.corner', 'br').then((c) => {
      const p = cornerXY(c, width, height, top);
      x.set(p.x);
      y.set(p.y);
    });
  }, [width, height, top]);

  // Made again only when the grid's size changes (or `onPress`: keep that stable)
  const gesture = useMemo(() => {
    const drag = Gesture.Pan()
      .onBegin(() => {
        sx.set(x.get());
        sy.set(y.get());
      })
      .onUpdate((e) => {
        x.set(sx.get() + e.translationX);
        y.set(sy.get() + e.translationY);
      })
      .onEnd((e) => {
        // Where it would go with its speed, then the nearest corner
        const px = x.get() + e.velocityX * 0.15 + W / 2;
        const py = y.get() + e.velocityY * 0.15 + H / 2;
        const c = `${py < (top + height) / 2 ? 't' : 'b'}${px < width / 2 ? 'l' : 'r'}` as Corner;
        const p = cornerXY(c, width, height, top);
        x.set(withSpring(p.x, { ...SNAP, velocity: e.velocityX }));
        y.set(withSpring(p.y, { ...SNAP, velocity: e.velocityY }));
        scheduleOnRN(saveCorner, c);
      });
    const tap = Gesture.Tap().onEnd((_e, ok) => {
      if (ok) scheduleOnRN(onPress);
    });
    return Gesture.Exclusive(drag, tap);
  }, [x, y, sx, sy, width, height, top, onPress]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }] }));

  return (
    <GestureDetector gesture={gesture}>
      <AView
        entering={enter}
        exiting={exit}
        accessibilityRole="button"
        accessibilityLabel={t('rooster.today')}
        accessibilityHint={t('rooster.todayHint')}
        className="absolute top-0 left-0"
        style={[{ width: W, height: H }, style]}
      >
        {/* See-through, so the classes under it still show (the position animates on the outer view) */}
        <View className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-ink" style={{ opacity: 0.72 }}>
          <Icon name="calendar" size={16} color="ink-inverse" />
          <Text variant="sm" bold tone="inverse">
            {t('rooster.today')}
          </Text>
        </View>
      </AView>
    </GestureDetector>
  );
});
