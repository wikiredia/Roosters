import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

/** Bottom sheet: scrim, grabber, title row with a close button. The one shadow in the app. */
export function Sheet({ visible, onClose, title, sub, left, children, closeLabel }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
        <Pressable accessibilityLabel={closeLabel} onPress={onClose} className="absolute inset-0 bg-scrim" />
        <View
          accessibilityViewIsModal
          className="bg-surface-raised rounded-t-sheet px-5 pt-2 gap-4"
          style={{
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            maxHeight: '90%',
            shadowColor: '#161F2A',
            shadowOpacity: 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: -2 },
            elevation: 12,
          }}
        >
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
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
