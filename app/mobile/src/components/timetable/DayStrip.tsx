import { type ComponentProps, memo, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { type SharedValue, useAnimatedReaction, useAnimatedStyle, useFrameCallback, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AView } from '@/components/ui/Motion';
import { Text } from '@/components/ui/Text';
import { type Lang, useT } from '@/i18n';
import { dateAt, MAX_DAYS } from '@/lib/days';
import { magnet, snap, tick } from '@/lib/haptics';
import { shortDate, weekdayShort } from '@/lib/time';

import { RESIZE, SWIPE } from './DayGrid';
import { KIND_DOT, type LessonKind } from './Timetable';

const H = 56;
/** How far (cells) the group has to be pushed past the strip's edge before the dates start scrolling */
const EDGE = 0.3;
/** Scrolling speed at the edge, days per second: starts calm, faster the further you push */
const SCROLL_MIN = 2.5;
const SCROLL_MAX = 9;
/** The picked-up group goes up or down with the finger, never further than this (× H) from the row */
const LIFT = 0.75;
/** Week drag (`weekDrag`): the next or previous week shows from this far (× H), and the week changes at WEEK_AT */
const GHOST_FROM = 0.4;
const WEEK_AT = 1;
/** How opaque that week above or below the row gets */
const GHOST = 0.5;
const NO_DOTS: LessonKind[] = [];

/** Rubber band: follows the finger at first, harder the further it goes, never past `cap` */
function rubber(d: number, cap: number) {
  'worklet';
  return Math.sign(d) * cap * (1 - Math.exp(-Math.abs(d) / cap));
}

/** How opaque a row of dates is at `y` (px from the strip's row): full on the row, fading away from it, and half
 * as a "ghost" on the side being pulled into view (`ghost`, or `carry` just after a week change; + = above). */
function fade(y: number, ghost: number, carry: number) {
  'worklet';
  const a = Math.abs(y) / H;
  const side = y < 0 ? 1 : -1;
  const g = Math.max(0, side * ghost, side * carry) * GHOST * Math.max(0, Math.min(1, 2 - a));
  return Math.max(1 - Math.min(1, a), g);
}

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
  /** The kinds of lessons on a day: a small dot each under the date. */
  kinds: ReadonlyMap<number, LessonKind[]>;
  onPick: (day: number) => void;
  /** The group was let go, or a swipe of the dates settles: the first day you see from now on (as the grid's `onTarget`). */
  onTarget: (start: number) => void;
  /** While the dates scroll (the group pushed at the edge, a week changed, a swipe of the dates): the first day
   * passed by, so the screen loads the days around it. */
  onMove: (start: number) => void;
  /** Every time the handle covers another number of days, and when it's let go (with the first day: dragged
   * left past it, the first day goes back with the finger). */
  onResize: (n: number) => void;
  onResizeEnd: (n: number, start?: number) => void;
  /** First time: the dash wiggles to show it can be dragged. */
  nudge?: boolean;
  /** A/B test: pull the picked-up group up or down to see the week before (above) or after (below) and change to
   * it, a week at a time. Off: up and down it only follows the finger a little and never changes the week. */
  weekDrag?: boolean;
};

/**
 * The week above the timetable, seven equal cells. What you see in the grid is a white cell (the first day) with
 * a grey band stretching out of it; the dash on the band's edge sets how many days you see (1–7), live: the
 * grid's columns get thinner or wider with your finger, a little sticky at every whole day (a tick each), and
 * settle with a bounce. Drag the dash left past the white cell and that first day follows your finger: the grid
 * goes back a few days.
 *
 * The white cell, the band and the dash are one group you can pick up: it lifts a little and follows your finger,
 * across over the dates (which stay put; the grid shows the days under it, live) and up or down, held to the row
 * like a rubber band (never more than LIFT × H away, back on the row when you let go). Across it sticks softly to
 * each day, with a tick each time the first day changes. It never leaves the strip: push it against the edge and
 * the dates scroll further in time (faster the further you push). Let go and it settles on a whole day.
 * With `weekDrag` (an A/B test), pulling it down shows the week before above the row, half see-through (pulling it
 * up: the week after, below); pull on and the row scrolls a week, the new one sliding in as the old one slides
 * out, and you can keep going a week at a time.
 *
 * Swipe the dates themselves (not the group) and they move with your finger like a carousel, with a flick, and
 * settle on whole days: the group keeps its cell, so you see other days (as a swipe on the grid). Under each date a
 * small dot per kind of lesson that day. Tap a day to start there. The dash wins over the group, the group over a
 * swipe of the dates or a tap.
 * Memo, and its gestures are made once: give it stable callbacks and the `kinds` Map (Calendar does), so it renders when its
 * days or size change, not with every swipe or sheet.
 */
export const DayStrip = memo(function DayStrip({ offset, count, n, k, width, from, to, today, lang, kinds, onPick, onTarget, onMove, onResize, onResizeEnd, nudge, weekDrag = false }: Props) {
  const { t } = useT();
  const cell = width / 7;
  // The day the cells are placed from. Never changes: the cells keep their place and only the shared offset moves them.
  // (Placing them from `from`, which changes with every swipe, moved the cells in this render and their sliding on the
  // UI thread a frame later: for a moment the strip showed other dates.)
  const [base] = useState(from);
  const startCount = useSharedValue(1);
  const startK = useSharedValue(0);
  const startOffset = useSharedValue(0);
  const swipeFrom = useSharedValue(0);
  const pulled = useSharedValue(false);
  const last = useSharedValue(0);
  // The group being dragged: lifted (0–1), the strip's first date (offset - k) while it scrolls at the edge,
  // how far it's pushed past the edge (cells, - left / + right) and the last start told to the screen
  const lifted = useSharedValue(0);
  const dragging = useSharedValue(false);
  const win = useSharedValue(0);
  const push = useSharedValue(0);
  const told = useSharedValue(0);
  // Up and down: the group (px from the row), the rows of dates (px, springs back to 0 after a week change), the
  // weeks changed in this drag, and how far the week above (+) or below (-) shows: live, and just after a change
  const gy = useSharedValue(0);
  const wy = useSharedValue(0);
  const weeks = useSharedValue(0);
  const ghost = useSharedValue(0);
  const carry = useSharedValue(0);
  // A tick for every whole day the first day passes while one of our gestures moves it (or a swipe settles)
  const ticking = useSharedValue(false);
  useAnimatedReaction(
    () => Math.round(offset.get()),
    (now, prev) => {
      if (prev !== null && now !== prev && ticking.get()) scheduleOnRN(tick);
    },
  );

  // A row of dates `r` weeks after the one in the strip (-1 above, +1 below: only with weekDrag)
  const dates = useAnimatedStyle(() => ({ opacity: fade(wy.get(), ghost.get(), carry.get()), transform: [{ translateX: (base - (offset.get() - k.get())) * cell }, { translateY: wy.get() }] }));
  const before = useAnimatedStyle(() => {
    const y = wy.get() - H;
    return { opacity: fade(y, ghost.get(), carry.get()), transform: [{ translateX: (base - (offset.get() - k.get() - 7)) * cell }, { translateY: y }] };
  });
  const after = useAnimatedStyle(() => {
    const y = wy.get() + H;
    return { opacity: fade(y, ghost.get(), carry.get()), transform: [{ translateX: (base - (offset.get() - k.get() + 7)) * cell }, { translateY: y }] };
  });
  const white = useAnimatedStyle(() => ({ left: k.get() * cell, width: cell, transform: [{ translateY: gy.get() }, { scale: 1 + lifted.get() * 0.06 }] }));
  const band = useAnimatedStyle(() => ({ left: k.get() * cell, width: count.get() * cell, transform: [{ translateY: gy.get() }, { scaleY: 1 + lifted.get() * 0.06 }] }));
  const body = useAnimatedStyle(() => ({ left: k.get() * cell, width: Math.max(0, count.get() * cell - 22), transform: [{ translateY: gy.get() }] }));
  const handle = useAnimatedStyle(() => ({ left: (k.get() + count.get()) * cell - 22, transform: [{ translateY: gy.get() }] }));
  // While the dash is dragged: a faint dash where it will settle (whole days), jumping from day to day ahead of the finger
  const resizing = useSharedValue(false);
  const target = useAnimatedStyle(() => {
    const days = Math.max(1, Math.min(MAX_DAYS, Math.round(count.get())));
    const first = Math.max(0, Math.min(Math.round(k.get()), 7 - days));
    return { left: (first + days) * cell - 22, opacity: withTiming(resizing.get() ? 0.45 : 0, { duration: 120 }) };
  });
  const wiggle = useSharedValue(0);
  const dash = useAnimatedStyle(() => ({ transform: [{ translateX: wiggle.get() }] }));
  useEffect(() => {
    wiggle.set(nudge ? withRepeat(withSequence(withTiming(0, { duration: 1400 }), withSpring(9, { damping: 8, stiffness: 300 }), withSpring(0, RESIZE)), -1) : withTiming(0));
  }, [nudge, wiggle]);

  // Taps through the gesture system too: a swipe never ends as a tap on the day under your finger.
  // The gestures are made again only when the strip's size changes (Calendar keeps the callbacks stable).
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(8)
        .onEnd((e, ok) => {
          if (ok) scheduleOnRN(onPick, Math.floor(offset.get() - k.get() + e.x / cell));
        }),
    [offset, k, cell, onPick],
  );

  // Swiping the dates: they follow the finger (the group keeps its cell, so offset moves with the dates), then with
  // the flick settle on a whole day, as a swipe on the grid
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-12, 12])
        .onBegin(() => {
          swipeFrom.set(offset.get());
          told.set(Math.round(offset.get()));
        })
        .onUpdate((e) => {
          ticking.set(true);
          offset.set(swipeFrom.get() - e.translationX / cell);
          const now = Math.round(offset.get());
          if (now !== told.get()) {
            told.set(now);
            scheduleOnRN(onMove, now);
          }
        })
        .onEnd((e) => {
          const v = -e.velocityX / cell;
          // A flick goes a few days further, never more than a week
          const start = Math.round(offset.get() + Math.max(-7, Math.min(7, v * 0.2)));
          offset.set(
            withSpring(start, { ...SWIPE, velocity: v }, (done) => {
              ticking.set(false);
              if (done) scheduleOnRN(snap);
            }),
          );
          scheduleOnRN(onTarget, start);
        }),
    [offset, swipeFrom, told, ticking, cell, onMove, onTarget],
  );

  // Picking up the group: it follows the finger, across over the dates (they stay put, so offset moves with k) and
  // up or down, held to the row; with weekDrag pulling it far enough up or down changes the week
  const move = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-6, 6])
        .activeOffsetY([-8, 8])
        .onBegin(() => {
          startK.set(k.get());
          win.set(offset.get() - k.get());
          told.set(Math.round(offset.get()));
          weeks.set(0);
        })
        .onStart(() => {
          dragging.set(true);
          lifted.set(withSpring(1, RESIZE));
        })
        .onUpdate((e) => {
          ticking.set(true);
          // Across: never off the strip (pushed past its edge the dates scroll instead, see the frame callback), and a
          // little sticky at every whole day so you feel the days go by
          const wanted = startK.get() + e.translationX / cell;
          const max = 7 - count.get();
          push.set(wanted - Math.max(0, Math.min(max, wanted)));
          const kk = Math.max(0, Math.min(max, magnet(win.get() + wanted) - win.get()));
          k.set(kk);
          offset.set(win.get() + kk);
          // Up and down: with the finger, harder the further from the row, never past LIFT
          const dy = e.translationY;
          gy.set(rubber(dy, LIFT * H));
          if (!weekDrag) return;
          // A week further every WEEK_AT × H of drag (back again when you pull back): down = the week before. The rows
          // jump a row so nothing moves on screen, then slide on: the new week comes in from outside, the old one goes
          const step = dy >= (weeks.get() + WEEK_AT) * H ? 1 : dy <= (weeks.get() - WEEK_AT) * H ? -1 : 0;
          if (step) {
            weeks.set(weeks.get() + step);
            win.set(win.get() - 7 * step);
            offset.set(win.get() + kk);
            wy.set(withSequence(withTiming(wy.get() - step * H, { duration: 0 }), withSpring(0, SWIPE)));
            carry.set(withSequence(withTiming(step, { duration: 0 }), withTiming(0, { duration: 280 })));
            const now = Math.round(offset.get());
            told.set(now);
            scheduleOnRN(onMove, now);
          }
          // The next week shows (half see-through) as you pull away from the row
          const rel = dy - weeks.get() * WEEK_AT * H;
          ghost.set(Math.sign(rel) * Math.max(0, Math.min(1, (Math.abs(rel) - GHOST_FROM * H) / ((WEEK_AT - GHOST_FROM) * H))));
        })
        .onFinalize(() => {
          if (!dragging.get()) return;
          dragging.set(false);
          ticking.set(false);
          push.set(0);
          lifted.set(withSpring(0, RESIZE));
          gy.set(withSpring(0, RESIZE));
          ghost.set(withTiming(0, { duration: 160 }));
          const start = Math.round(offset.get());
          offset.set(withSpring(start, SWIPE, (done) => done && scheduleOnRN(snap)));
          k.set(withSpring(Math.round(k.get()), SWIPE));
          scheduleOnRN(onTarget, start);
        })
        .blocksExternalGesture(swipe, tap),
    [k, win, offset, told, dragging, lifted, push, startK, count, cell, gy, wy, weeks, ghost, carry, ticking, weekDrag, onMove, onTarget, swipe, tap],
  );

  // The dash wins over moving the group, swiping the dates and a tap
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 16, right: 16, top: 10, bottom: 10 })
        .activeOffsetX([-4, 4])
        .onStart(() => {
          resizing.set(true);
          ticking.set(true);
        })
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
            // left; at the strip's edge the dates slide right under it instead), sticky at every whole day
            const back = magnet(1 - live);
            count.set(1);
            k.set(Math.max(0, startK.get() - back));
            offset.set(startOffset.get() - back);
            pulled.set(true);
            live = 1;
          } else {
            // Rubber band past 7; up to it a little sticky at every whole number of days
            live = live > MAX_DAYS ? MAX_DAYS + (live - MAX_DAYS) / 4 : magnet(live);
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
            scheduleOnRN(tick);
          }
        })
        .onFinalize(() => {
          if (resizing.get()) scheduleOnRN(snap);
          resizing.set(false);
          ticking.set(false);
          const days = Math.max(1, Math.min(MAX_DAYS, Math.round(count.get())));
          count.set(withSpring(days, RESIZE));
          k.set(withSpring(Math.max(0, Math.min(Math.round(k.get()), 7 - days)), RESIZE));
          if (pulled.get()) {
            const start = Math.round(offset.get());
            offset.set(withSpring(start, SWIPE));
            scheduleOnRN(onResizeEnd, days, start);
          } else scheduleOnRN(onResizeEnd, days, undefined);
        })
        .blocksExternalGesture(move, swipe, tap),
    [startCount, startK, startOffset, pulled, last, resizing, ticking, count, k, offset, cell, onResize, onResizeEnd, move, swipe, tap],
  );

  // The strip itself: a swipe of the dates or a tap, whichever it turns out to be
  const strip = useMemo(() => Gesture.Race(swipe, tap), [swipe, tap]);

  // Pushed against an edge: the dates scroll under the group, every frame (the group stays at the edge)
  useFrameCallback((frame) => {
    const p = push.get();
    if (!dragging.get() || Math.abs(p) < EDGE) return;
    const dt = (frame.timeSincePreviousFrame ?? 16) / 1000;
    const speed = Math.min(SCROLL_MAX, SCROLL_MIN + (Math.abs(p) - EDGE) * 12);
    win.set(win.get() + Math.sign(p) * speed * dt);
    offset.set(win.get() + k.get());
    const now = Math.round(offset.get());
    if (now !== told.get()) {
      told.set(now);
      scheduleOnRN(onMove, now);
    }
  });

  // With weekDrag a week changes in one go, before the screen has rendered the new days: each row has a week more
  // to the left (forward there's enough already)
  const lo = weekDrag ? from - 7 : from;

  return (
    <GestureDetector gesture={strip}>
      {/* Not clipped: the picked-up group and the weeks above or below hang over the grid (Calendar puts the strip
          above it). The dates are clipped to the strip's width in their own layer. */}
      <View style={{ height: H }} accessibilityLabel={t('rooster.stripLabel', { n })}>
        {width ? (
          <>
            <AView className="absolute top-0 bottom-0 rounded-chip bg-surface-sunken" style={band} pointerEvents="none" />
            <AView className="absolute top-0 bottom-0 rounded-chip bg-surface border border-line" style={white} pointerEvents="none" />
            <View className="absolute left-0 right-0 overflow-hidden" style={{ top: -H, height: 3 * H }} pointerEvents="none">
              {weekDrag ? <DateRow lo={lo - 7} hi={to - 7} base={base} cell={cell} today={today} lang={lang} kinds={kinds} style={before} /> : null}
              <DateRow lo={lo} hi={to} base={base} cell={cell} today={today} lang={lang} kinds={kinds} style={dates} onPick={onPick} />
              {weekDrag ? <DateRow lo={lo + 7} hi={to + 7} base={base} cell={cell} today={today} lang={lang} kinds={kinds} style={after} /> : null}
            </View>
            {/* The group's body (over the dates): pick it up to move what you see */}
            <GestureDetector gesture={move}>
              <AView className="absolute top-0 bottom-0" style={body} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
            </GestureDetector>
            <AView className="absolute top-0 bottom-0 w-[22px] items-center justify-center" style={target} pointerEvents="none">
              <View className="w-1 h-6 rounded-full bg-ink-3" />
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
});

type RowProps = {
  lo: number;
  hi: number;
  base: number;
  cell: number;
  today: number;
  lang: Lang;
  kinds: ReadonlyMap<number, LessonKind[]>;
  style: ComponentProps<typeof AView>['style'];
  /** Only the strip's own row: screen readers activate its days; the weeks above and below are hidden from them */
  onPick?: (day: number) => void;
};

/** One row of dates (days lo … hi), in the middle third of the clipped layer; only `style` (shared values) moves it. */
const DateRow = memo(function DateRow({ lo, hi, base, cell, today, lang, kinds, style, onPick }: RowProps) {
  const days: number[] = [];
  for (let i = lo; i <= hi; i++) days.push(i);
  return (
    <AView
      className="absolute left-0"
      style={[{ top: H, height: H }, style]}
      accessibilityElementsHidden={!onPick}
      importantForAccessibility={onPick ? 'auto' : 'no-hide-descendants'}
    >
      {days.map((day) => {
        const d = dateAt(day);
        const weekend = day % 7 >= 5;
        const dots = kinds.get(day) ?? NO_DOTS;
        return (
          // Touches go to the strip's tap gesture; screen readers activate the day itself
          <View
            key={day}
            accessible={!!onPick}
            accessibilityRole={onPick ? 'button' : undefined}
            accessibilityLabel={onPick ? shortDate(d, lang) : undefined}
            onAccessibilityTap={onPick ? () => onPick(day) : undefined}
            className="absolute top-0 bottom-0 items-center justify-center"
            style={{ left: (day - base) * cell, width: cell }}
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
  );
});
