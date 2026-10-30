import { type ComponentRef, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useStable } from '@/lib/latest';

import { IconButton } from './Button';
import { dropSheet, nextSheetOrder, putSheet } from './SheetHost';
import { Text } from './Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  sub?: string;
  left?: ReactNode;
  children: ReactNode;
  closeLabel: string;
  /** The screen's own 0 → 1 while the sheet opens (and its height), to move things behind it along (a chat
   * scrolls up so the message you picked stays above the sheet). Without them the sheet keeps its own. */
  progress?: SharedValue<number>;
  height?: SharedValue<number>;
  /** Over the scrim, under the sheet: not dimmed (the message you picked, lifted out of the chat) */
  above?: ReactNode;
  /** A sheet that can open in two stages, driven from the UI thread (a tap on the grid: `useSheetPeek`). It stays
   * mounted (out of sight) so a gesture can start showing it before React knows; `visible` still means open. */
  peek?: SheetPeek;
};

const OPEN = { duration: 230, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: 180, easing: Easing.in(Easing.cubic) };
/** Dragged down this far (or flicked down) closes the sheet. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

/** How much of a peeking sheet shows (px from its top): the grabber, the title row and a bit of the first card. */
export const PEEK_PX = 104;
const PEEK_IN = { duration: 120, easing: Easing.out(Easing.cubic) };
const PEEK_OUT = { duration: 120, easing: Easing.in(Easing.cubic) };
/** Reduced motion: no slide, a short fade (Reanimated would otherwise skip the animation altogether) */
const FADE = { duration: 160, reduceMotion: ReduceMotion.Never };
/** `SheetPeek.stage`: out of sight, peeking, open (or opening) */
export const SHEET_IDLE = 0;
export const SHEET_PEEK = 1;
export const SHEET_OPEN = 2;

/** The UI-thread side of a sheet that peeks (see `peekSheet`). Make one per sheet with `useSheetPeek`. */
export type SheetPeek = { stage: SharedValue<number>; progress: SharedValue<number>; height: SharedValue<number>; reduced: SharedValue<boolean> };

export function useSheetPeek(): SheetPeek {
  const stage = useSharedValue(SHEET_IDLE);
  const progress = useSharedValue(0);
  const height = useSharedValue(600);
  const reduced = useSharedValue(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    reduced.set(reduce);
  }, [reduce, reduced]);
  return useMemo(() => ({ stage, progress, height, reduced }), [stage, progress, height, reduced]);
}

/** `progress` at which `PEEK_PX` of a sheet `h` high shows (the slide hides `h + 40`, the shadow included) */
function peekAt(h: number) {
  'worklet';
  return Math.min(1, (PEEK_PX + 40) / (h + 40));
}

/** Start the peek: the sheet slides up `PEEK_PX` (no scrim, no touches). From a gesture, in the frame the finger lifts.
 * With reduced motion nothing moves yet. Only from out of sight. */
export function peekSheet(p: SheetPeek) {
  'worklet';
  if (p.stage.get() !== SHEET_IDLE) return;
  p.stage.set(SHEET_PEEK);
  if (!p.reduced.get()) p.progress.set(withTiming(peekAt(p.height.get()), PEEK_IN));
}

/** Go on from the peek (or from nothing) to fully open, in one motion; the caller then sets `visible`. */
export function openPeek(p: SheetPeek) {
  'worklet';
  if (p.stage.get() === SHEET_OPEN) return;
  p.stage.set(SHEET_OPEN);
  p.progress.set(withTiming(1, p.reduced.get() ? FADE : OPEN));
}

/** A second tap: the peek slides back down, fast. Does nothing to a sheet that is open. */
export function dropPeek(p: SheetPeek) {
  'worklet';
  if (p.stage.get() !== SHEET_PEEK) return;
  p.stage.set(SHEET_IDLE);
  p.progress.set(withTiming(0, PEEK_OUT));
}

/** Bottom sheet: scrim, grabber, title row with a close button. The one shadow in the app.
 * Drawn in the app's `SheetHost` (a portal), not in a native `Modal`: a sheet appears in the same frame and touches
 * outside a peeking one still reach the screen. The scrim fades while the sheet slides (one animation, `progress`),
 * both ways; the sheet can be dragged down by its top to close. It stays mounted until the closing animation has
 * finished (with `peek`: always). */
export function Sheet({ visible, onClose, title, sub, left, children, closeLabel, above, peek, ...shared }: Props) {
  const insets = useSafeAreaInsets();
  const [id] = useState(nextSheetOrder);
  const [order, setOrder] = useState(id);
  const [wasVisible, setWasVisible] = useState(false);
  const [mounted, setMounted] = useState(visible || !!peek);
  const ownProgress = useSharedValue(0);
  const ownHeight = useSharedValue(600);
  const progress = peek?.progress ?? shared.progress ?? ownProgress;
  const height = peek?.height ?? shared.height ?? ownHeight;
  const drag = useSharedValue(0);
  const titleRef = useRef<ComponentRef<typeof View>>(null);

  // Opening mounts right away (during render, not in an effect), on top of the sheets already there; closing
  // unmounts after the slide
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOrder(nextSheetOrder());
  }
  if ((visible || peek) && !mounted) setMounted(true);

  // Before the first paint: the slide starts in the frame the sheet appears (a tap feels answered at once)
  useLayoutEffect(() => {
    if (visible) {
      drag.set(0);
      // Opened by its gesture already (the peek went on to open): don't start over
      if (peek) openPeek(peek);
      else progress.set(withTiming(1, OPEN));
      // Screen readers start on the title, once it's there
      const focus = setTimeout(() => {
        if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
      }, OPEN.duration);
      return () => clearTimeout(focus);
    }
    if (!mounted || peek?.stage.get() === SHEET_PEEK) return;
    peek?.stage.set(SHEET_IDLE);
    progress.set(
      withTiming(0, CLOSE, (done) => {
        if (done && !peek) scheduleOnRN(setMounted, false);
      }),
    );
  }, [visible]);

  // The content of a peeking sheet came in (or changed): it keeps showing the same strip
  useAnimatedReaction(
    () => height.get(),
    (h, prev) => {
      if (peek && prev !== null && h !== prev && peek.stage.get() === SHEET_PEEK && !peek.reduced.get()) peek.progress.set(withTiming(peekAt(h), { duration: 80 }));
    },
  );

  // One gesture for the life of the sheet: `close` keeps its identity while `onClose` is a new function on every render
  const close = useStable(onClose);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .onUpdate((e) => {
          // Down follows the finger, up resists
          drag.set(e.translationY > 0 ? e.translationY : e.translationY / 6);
        })
        .onEnd((e) => {
          if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
            scheduleOnRN(close);
          } else {
            drag.set(withSpring(0, { damping: 18, stiffness: 220 }));
          }
        }),
    [drag, close],
  );

  const scrim = useAnimatedStyle(() => {
    const p = progress.get();
    // A peeking sheet has no scrim yet: it comes in between the peek and fully open
    let shown = p;
    if (peek && !peek.reduced.get()) {
      const h = height.get() + 40;
      shown = Math.max(0, (p * h - PEEK_PX - 40) / Math.max(1, h - PEEK_PX - 40));
    }
    return { opacity: shown * interpolate(drag.get(), [0, height.get()], [1, 0.2], 'clamp') };
  });
  const sheet = useAnimatedStyle(() => {
    const p = progress.get();
    if (peek && peek.reduced.get()) return { opacity: p, transform: [{ translateY: p > 0 ? drag.get() : height.get() + 40 }] };
    return { opacity: 1, transform: [{ translateY: (1 - p) * (height.get() + 40) + drag.get() }] };
  });

  const node = mounted ? (
    <KeyboardAvoidingView behavior="padding" enabled={visible} style={styles.fill} className="justify-end">
      {/* Animated styles on Animated.View, classes on the plain View inside */}
      <Animated.View style={[StyleSheet.absoluteFill, scrim]}>
        <Pressable accessibilityLabel={closeLabel} onPress={onClose} className="flex-1 bg-scrim" />
      </Animated.View>
      {above}
      <Animated.View
        accessibilityViewIsModal={visible}
        onLayout={(e) => {
          height.set(e.nativeEvent.layout.height);
        }}
        style={[{ maxHeight: '90%' }, sheet]}
      >
        <View
          className="bg-surface-raised rounded-t-sheet px-5 pt-2 gap-4 flex-shrink"
          style={{
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            shadowColor: '#161F2A',
            shadowOpacity: 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: -2 },
            elevation: 12,
          }}
        >
          <GestureDetector gesture={pan}>
            <View className="gap-4">
              <View className="w-10 h-[5px] rounded-full bg-line-strong self-center mb-1" />
              {title ? (
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-row items-center gap-3 flex-1">
                    {left}
                    <View ref={titleRef} className="flex-1" accessible accessibilityRole="header" accessibilityLabel={sub ? `${title}, ${sub}` : title}>
                      <Text variant="sheet">{title}</Text>
                      {sub ? (
                        <Text variant="sm" tone="ink2">
                          {sub}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <IconButton icon="close" label={closeLabel} filled onPress={onClose} />
                </View>
              ) : null}
            </View>
          </GestureDetector>
          {/* No scroll bar: a sheet is short, and when it does scroll the bar only gets in the way */}
          <ScrollView bounces={false} overScrollMode="never" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4">
            {children}
          </ScrollView>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  ) : null;

  // Into the host, before the first paint, on every render of this sheet (only this sheet's layer renders again)
  useLayoutEffect(() => {
    if (node) putSheet({ id, order, visible, node, close });
    else dropSheet(id);
  });
  useLayoutEffect(() => () => dropSheet(id), [id]);

  return null;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
