import { type ReactNode, useLayoutEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, type SharedValue, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { IconButton } from './Button';
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
};

const OPEN = { duration: 230, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: 180, easing: Easing.in(Easing.cubic) };
/** Dragged down this far (or flicked down) closes the sheet. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

/** Bottom sheet: scrim, grabber, title row with a close button. The one shadow in the app.
 * The scrim fades while the sheet slides (one animation, `progress`), both ways; the sheet can be
 * dragged down by its top to close. It stays mounted until the closing animation has finished. */
export function Sheet({ visible, onClose, title, sub, left, children, closeLabel, above, ...shared }: Props) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const ownProgress = useSharedValue(0);
  const ownHeight = useSharedValue(600);
  const progress = shared.progress ?? ownProgress;
  const height = shared.height ?? ownHeight;
  const drag = useSharedValue(0);

  // Opening mounts right away (during render, not in an effect); closing unmounts after the slide
  if (visible && !mounted) setMounted(true);

  // Before the first paint: the slide starts in the frame the sheet appears (a tap feels answered at once)
  useLayoutEffect(() => {
    if (visible) {
      drag.set(0);
      progress.set(withTiming(1, OPEN));
    } else if (mounted) {
      progress.set(
        withTiming(0, CLOSE, (done) => {
          if (done) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [visible]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      // Down follows the finger, up resists
      drag.set(e.translationY > 0 ? e.translationY : e.translationY / 6);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        scheduleOnRN(onClose);
      } else {
        drag.set(withSpring(0, { damping: 18, stiffness: 220 }));
      }
    });

  const scrim = useAnimatedStyle(() => ({
    opacity: progress.get() * interpolate(drag.get(), [0, height.get()], [1, 0.2], 'clamp'),
  }));
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * (height.get() + 40) + drag.get() }],
  }));

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
          {/* Animated styles on Animated.View, classes on the plain View inside */}
          <Animated.View style={[StyleSheet.absoluteFill, scrim]}>
            <Pressable accessibilityLabel={closeLabel} onPress={onClose} className="flex-1 bg-scrim" />
          </Animated.View>
          {above}
          <Animated.View
            accessibilityViewIsModal
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
                        <View className="flex-1">
                          <Text variant="sheet" accessibilityRole="header">
                            {title}
                          </Text>
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
      </GestureHandlerRootView>
    </Modal>
  );
}
