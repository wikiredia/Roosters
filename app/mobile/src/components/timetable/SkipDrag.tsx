import { useEffect } from 'react';
import { View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { scheduleOnRN } from 'react-native-worklets';

import type { Lesson } from '@/api/types';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';

import { BlockView, Hatch } from './Timetable';

/** Width of the bin that slides in on the right while you drag a class. */
export const BIN_W = 84;
/** Resting this long (ms) on a class before moving picks it up whichever way you go; quicker and sideways is a swipe
 * through the days. */
const HOLD = 140;
/** A class you hold still lifts (a little bigger, a shadow) after this long (ms): it shows it can be dragged. */
const LIFT_AFTER = 220;
/** Moving at least this fast (px/s) to the right when you let go throws the card into the bin. */
const THROW_V = 900;
/** The card hangs from your finger: it swings with how fast you move, then settles. */
const SWING = { damping: 13, stiffness: 150, mass: 0.6 };
const BACK = { damping: 18, stiffness: 220, mass: 0.8 };

/** A class you can drag: its day (lib/days index) and minutes, as the grid draws it (merged double periods). */
export type DragTarget = { day: number; start: number; end: number };

/**
 * Where a drag is, on the UI thread, shared by the grid's gesture (`useSkipGesture`, in DayGrid) and what you see
 * (`DragLayer`, in Calendar). phase: 0 nothing, 1 a finger rests on a class, 2 dragging, 3 flying into the bin,
 * 4 going back to its place. Positions are in the grid's own coordinates (left of the first day column = 0).
 */
export type SkipDrag = {
  phase: SharedValue<number>;
  rect: SharedValue<{ x: number; y: number; w: number; h: number }>;
  grab: SharedValue<{ x: number; y: number }>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  rot: SharedValue<number>;
  lift: SharedValue<number>;
  over: SharedValue<number>;
  gone: SharedValue<number>;
};

export function useSkipDrag(): SkipDrag {
  return {
    phase: useSharedValue(0),
    rect: useSharedValue({ x: 0, y: 0, w: 0, h: 0 }),
    grab: useSharedValue({ x: 0, y: 0 }),
    tx: useSharedValue(0),
    ty: useSharedValue(0),
    rot: useSharedValue(0),
    lift: useSharedValue(0),
    over: useSharedValue(0),
    gone: useSharedValue(0),
  };
}

type GestureProps = {
  drag: SkipDrag;
  targets: SharedValue<DragTarget[]>;
  offset: SharedValue<number>;
  count: SharedValue<number>;
  width: number;
  height: number;
  /** Top of the hours (minutes) and pixels per hour, as the grid draws them */
  min0: number;
  min1: number;
  pxPerHour: number;
  labelH: number;
  /** A finger came down on a class: get it ready to show (before it's picked up, so the card is there at once) */
  onPick: (day: number, start: number) => void;
  /** It landed in the bin */
  onDrop: (day: number, start: number) => void;
};

/**
 * The drag on a class, for the grid's gesture tree (before the swipe through the days, which waits for it to fail).
 * It decides itself when it starts (manual activation): a finger on a class that rests a moment, or moves more up or
 * down than sideways, picks the card up at once (no long press needed); a quick sideways swipe stays a swipe through
 * the days, and a tap stays a tap. Let go over the bin, or throw it to the right, and it's skipped.
 */
export function useSkipGesture(p: GestureProps) {
  const { drag, targets, offset, count, width, height } = p;
  const down = useSharedValue({ x: 0, y: 0, at: 0, day: 0, start: 0 });
  const vxLast = useSharedValue(0);

  return Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e, m) => {
      // A second finger while dragging: ignore it (a card still flying or going back is simply taken over)
      if (drag.phase.get() === 2) return;
      if (e.numberOfTouches > 1) {
        m.fail();
        return;
      }
      const touch = e.allTouches[0];
      const colW = width / count.get();
      const off = offset.get();
      const day = Math.floor(off + touch.x / colW);
      const min = p.min0 + ((touch.y - p.labelH) / p.pxPerHour) * 60;
      const hit = targets.get().find((g) => g.day === day && g.start <= min && min < g.end);
      if (!hit) {
        m.fail();
        return;
      }
      const y = (v: number) => p.labelH + ((v - p.min0) / 60) * p.pxPerHour;
      const top = y(Math.max(hit.start, p.min0));
      const rect = { x: (day - off) * colW + 2, y: top, w: colW - 4, h: Math.max(y(Math.min(hit.end, p.min1)) - top - 3, 16) };
      drag.rect.set(rect);
      drag.grab.set({ x: touch.x - rect.x, y: touch.y - rect.y });
      drag.tx.set(0);
      drag.ty.set(0);
      drag.rot.set(0);
      drag.over.set(0);
      drag.gone.set(0);
      drag.phase.set(1);
      drag.lift.set(withDelay(LIFT_AFTER, withSpring(1, SWING)));
      down.set({ x: touch.x, y: touch.y, at: Date.now(), day, start: hit.start });
      scheduleOnRN(p.onPick, day, hit.start);
    })
    .onTouchesMove((e, m) => {
      if (drag.phase.get() !== 1) return;
      const touch = e.allTouches[0];
      const d = down.get();
      const dx = touch.x - d.x;
      const dy = touch.y - d.y;
      if (dx * dx + dy * dy < 36) return;
      if (Date.now() - d.at >= HOLD || Math.abs(dy) > Math.abs(dx) * 0.8) m.activate();
      else {
        drag.lift.set(withTiming(0, { duration: 100 }));
        drag.phase.set(0);
        m.fail();
      }
    })
    .onTouchesUp((_e, m) => {
      if (drag.phase.get() !== 1) return;
      drag.lift.set(withTiming(0, { duration: 120 }));
      drag.phase.set(0);
      m.fail();
    })
    .onFinalize(() => {
      // Never picked up (a tap, a swipe, a second finger): put the lift away
      if (drag.phase.get() !== 1) return;
      drag.lift.set(withTiming(0, { duration: 120 }));
      drag.phase.set(0);
    })
    .onStart(() => {
      drag.phase.set(2);
      drag.lift.set(withSpring(1, SWING));
    })
    .onUpdate((e) => {
      drag.tx.set(e.translationX);
      drag.ty.set(e.translationY);
      // Smooth the speed a little, so the swing doesn't jitter with every touch event
      const vx = vxLast.get() * 0.6 + e.velocityX * 0.4;
      vxLast.set(vx);
      const r = drag.rect.get();
      const below = drag.grab.get().y < r.h / 2 ? 1 : -1;
      const fingerX = down.get().x + e.translationX;
      const isOver = fingerX > width - BIN_W ? 1 : 0;
      if (isOver !== Math.round(drag.over.get())) drag.over.set(withTiming(isOver, { duration: 140 }));
      drag.rot.set(withSpring(Math.max(-18, Math.min(18, vx / 55)) * below + isOver * 6, SWING));
    })
    .onEnd((e) => {
      const fingerX = down.get().x + e.translationX;
      const over = fingerX > width - BIN_W;
      const thrown = e.velocityX > THROW_V && fingerX + e.velocityX * 0.2 > width - BIN_W * 0.5;
      const r = drag.rect.get();
      if (over || thrown) {
        drag.phase.set(3);
        drag.over.set(withTiming(1, { duration: 100 }));
        const fly = { duration: thrown && !over ? 200 : 240, easing: Easing.in(Easing.quad) };
        drag.tx.set(withTiming(width - BIN_W / 2 - (r.x + r.w / 2), fly));
        drag.ty.set(withTiming(height / 2 - (r.y + r.h / 2), fly));
        drag.rot.set(withTiming(drag.rot.get() + 30, fly));
        drag.gone.set(
          withTiming(1, fly, (done) => {
            if (!done) return;
            drag.phase.set(0);
            drag.over.set(withDelay(160, withTiming(0, { duration: 200 })));
          }),
        );
        const d = down.get();
        scheduleOnRN(p.onDrop, d.day, d.start);
      } else {
        drag.phase.set(4);
        drag.over.set(withTiming(0, { duration: 140 }));
        drag.rot.set(withSpring(0, BACK));
        drag.lift.set(withSpring(0, BACK));
        drag.tx.set(withSpring(0, { ...BACK, velocity: e.velocityX }));
        drag.ty.set(
          withSpring(0, { ...BACK, velocity: e.velocityY }, (done) => {
            if (done && drag.phase.get() === 4) drag.phase.set(0);
          }),
        );
      }
      vxLast.set(0);
    });
}

/**
 * What you see while dragging, over the grid (it never takes a touch): a dashed hole where the class was, the card
 * hanging from your finger (it swings as you move, and shrinks over the bin), and the bin on the right: a see-through
 * zone of faint grey diagonal lines (the grid stays visible through it) that darkens, and whose bin opens up, when the
 * card is over it. The bin and its word sit on a patch, so the lines stop around them. `lesson`: the class under your
 * finger (Calendar keeps it).
 */
export function DragLayer({ drag, lesson, width, height, compact }: { drag: SkipDrag; lesson: Lesson | null; width: number; height: number; compact: boolean }) {
  const { t } = useT();
  const lines = String(useCSSVariable('--color-ink-3') ?? '#6E6A62');
  const show = useDerivedValue(() => withSpring(drag.phase.get() === 2 || drag.phase.get() === 3 ? 1 : 0, SWING));

  const hole = useAnimatedStyle(() => {
    const r = drag.rect.get();
    return { left: r.x, top: r.y, width: r.w, height: r.h, opacity: drag.phase.get() >= 2 ? 1 : 0 };
  });
  const card = useAnimatedStyle(() => {
    const r = drag.rect.get();
    const g = drag.grab.get();
    const phase = drag.phase.get();
    const scale = (1 + 0.06 * drag.lift.get()) * (1 - 0.3 * drag.over.get()) * (1 - 0.75 * drag.gone.get());
    return {
      left: r.x,
      top: r.y,
      width: r.w,
      height: r.h,
      opacity: phase === 0 || (phase === 1 && drag.lift.get() < 0.02) ? 0 : 1 - drag.gone.get(),
      transformOrigin: [g.x, g.y, 0],
      transform: [{ translateX: drag.tx.get() }, { translateY: drag.ty.get() }, { rotate: `${drag.rot.get()}deg` }, { scale }],
      shadowOpacity: 0.22 * drag.lift.get(),
      elevation: 12 * drag.lift.get(),
    };
  });
  const bin = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(show.get(), [0, 1], [BIN_W + 24, 0]) }],
    // Barely tinted, so the days behind it stay visible; a little more when the card is over it
    backgroundColor: interpolateColor(drag.over.get(), [0, 1], ['rgba(110,106,98,0.04)', 'rgba(110,106,98,0.12)']),
  }));
  const hatch = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * drag.over.get() }));
  const lid = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.3 * drag.over.get() }, { rotate: `${-14 * drag.over.get()}deg` }],
  }));
  const idle = useAnimatedStyle(() => ({ opacity: 1 - drag.over.get() }));
  const hot = useAnimatedStyle(() => ({ opacity: drag.over.get() }));

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      <Animated.View style={[{ position: 'absolute' }, hole]} className="rounded-block border-[1.5px] border-dashed border-line-strong bg-surface-sunken" />
      <Animated.View
        style={[{ position: 'absolute', top: 0, bottom: 0, right: 0, width: BIN_W }, bin]}
        className="rounded-l-card overflow-hidden border-l-[1.5px] border-y-[1.5px] border-dashed border-line-strong items-center justify-center"
      >
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, hatch]}>
          <Hatch color={lines} gap={9} opacity={0.35} />
        </Animated.View>
        <View className="items-center gap-1.5 rounded-card bg-bg px-1 py-2" style={{ width: BIN_W - 12 }}>
          <Animated.View style={lid}>
            <View>
              <Animated.View style={idle}>
                <Icon name="trash" size={26} color="ink-3" strokeWidth={2} />
              </Animated.View>
              <Animated.View style={[{ position: 'absolute' }, hot]}>
                <Icon name="trash" size={26} color="ink" strokeWidth={2.25} />
              </Animated.View>
            </View>
          </Animated.View>
          <View className="self-stretch">
            <Animated.View style={idle}>
              <Text variant="xs" bold tone="ink3" numberOfLines={1} className="text-center">
                {t('skip.drop')}
              </Text>
            </Animated.View>
            <Animated.View style={[{ position: 'absolute', left: 0, right: 0 }, hot]}>
              <Text variant="xs" bold numberOfLines={1} className="text-center">
                {t('skip.release')}
              </Text>
            </Animated.View>
          </View>
        </View>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', shadowColor: '#161F2A', shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }, card]}>
        {lesson ? <BlockView block={{ type: 'lesson', lesson, past: false }} style={{ flex: 1 }} compact={compact} t={t} /> : null}
      </Animated.View>
    </View>
  );
}

/** Keeps the grid's draggable classes in a shared value, for the gesture on the UI thread. */
export function useDragTargets(list: DragTarget[]) {
  const targets = useSharedValue<DragTarget[]>([]);
  const key = list.map((g) => `${g.day}:${g.start}:${g.end}`).join();
  useEffect(() => {
    targets.set(list);
  }, [key]);
  return targets;
}
