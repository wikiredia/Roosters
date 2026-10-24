import { type ReactNode, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
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
};

const OPEN = { duration: 280, easing: Easing.out(Easing.cubic) };
const CLOSE = { duration: 200, easing: Easing.in(Easing.cubic) };
/** Dragged down this far (or flicked down) closes the sheet. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

/** Bottom sheet: scrim, grabber, title row with a close button. The one shadow in the app.
 * The scrim fades while the sheet slides (one animation, `progress`), both ways; the sheet can be
 * dragged down by its top to close. It stays mounted until the closing animation has finished. */
export function Sheet({ visible, onClose, title, sub, left, children, closeLabel }: Props) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(600);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.value = 0;
      progress.value = withTiming(1, OPEN);
    } else if (mounted) {
      progress.value = withTiming(0, CLOSE, (done) => {
        if (done) scheduleOnRN(setMounted, false);
      });
    }
  }, [visible]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      // Down follows the finger, up resists
      drag.value = e.translationY > 0 ? e.translationY : e.translationY / 6;
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        scheduleOnRN(onClose);
      } else {
        drag.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const scrim = useAnimatedStyle(() => ({
    opacity: progress.value * interpolate(drag.value, [0, height.value], [1, 0.2], 'clamp'),
  }));
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * (height.value + 40) + drag.value }],
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
          <Animated.View
            accessibilityViewIsModal
            onLayout={(e) => {
              height.value = e.nativeEvent.layout.height;
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
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4">
                {children}
              </ScrollView>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}
