import { router } from 'expo-router';
import { type ReactNode, type RefObject, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

import { IconButton } from './Button';
import { Mascot } from './Brand';
import { NetBanner } from './NetBanner';
import { Text } from './Text';

type ScreenProps = {
  children: ReactNode;
  /** Large title header (tabs) */
  title?: string;
  eyebrow?: string;
  right?: ReactNode;
  /** Small centered title with a back button (pushed screens) */
  navTitle?: string;
  back?: boolean;
  /** Onboarding progress: [step, of] */
  progress?: [number, number];
  navRight?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  /** Pull to refresh. The spinner shows only while a pull you made is running: a background refetch
   * (after saving something, on focus, polling) never moves the page or shows the spinner. */
  onRefresh?: () => Promise<unknown> | void;
  contentClassName?: string;
  /** No offline banner (onboarding before sign-in) */
  noBanner?: boolean;
  /** The scroll view, for a screen that scrolls something into view (a search field above the keyboard) */
  scrollRef?: RefObject<ScrollView | null>;
};

/** Every screen: safe area, header, network banner, scrollable content and an optional sticky footer. */
export function Screen({ children, title, eyebrow, right, navTitle, back, progress, navRight, footer, scroll = true, onRefresh, contentClassName, noBanner, scrollRef }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const hasNav = back || progress || navTitle !== undefined;
  const [pulling, setPulling] = useState(false);
  async function pull() {
    setPulling(true);
    try {
      await onRefresh?.();
    } finally {
      setPulling(false);
    }
  }
  const body = (
    <View className={cn('px-5 gap-6 pb-6', contentClassName)}>
      {!noBanner ? <NetBanner /> : null}
      {children}
    </View>
  );
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      {hasNav ? (
        <View className="flex-row items-center gap-1 px-3 min-h-[52px]">
          {back ? (
            <IconButton icon="back" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          ) : (
            <View className="w-11" />
          )}
          {progress ? (
            <>
              <View className="flex-1 flex-row gap-1.5 ml-2 mr-3" accessibilityLabel={t('onboarding.step', { n: progress[0], of: progress[1] })}>
                {Array.from({ length: progress[1] }, (_, i) => (
                  <View key={i} className={cn('flex-1 h-2 rounded', i + 1 < progress[0] ? 'bg-ink' : i + 1 === progress[0] ? 'bg-you' : 'bg-line-strong')} />
                ))}
              </View>
              <Text variant="sm" bold tone="ink2" className="pr-2">
                {progress[0]}/{progress[1]}
              </Text>
            </>
          ) : (
            <Text bold className="flex-1 text-center" accessibilityRole="header">
              {navTitle}
            </Text>
          )}
          {navRight ?? (progress ? null : <View className="w-11" />)}
        </View>
      ) : null}
      {title ? (
        <View className="px-5 pt-1 pb-3">
          {/* The eyebrow has the whole width and one line: a long date never pushes the page down */}
          {eyebrow ? (
            <Text variant="eyebrow" numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <View className="flex-row items-end justify-between gap-3 min-h-11">
            <Text variant="title" accessibilityRole="header" numberOfLines={1} className="flex-shrink">
              {title}
            </Text>
            {right}
          </View>
        </View>
      ) : null}
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          // iOS: the keyboard doesn't cover the end of the page, it can still be scrolled into view
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingTop: hasNav ? 16 : 4 }}
          refreshControl={onRefresh ? <RefreshControl refreshing={pulling} onRefresh={pull} /> : undefined}
        >
          {body}
        </ScrollView>
      ) : (
        <View className="flex-1">{body}</View>
      )}
      {footer ? (
        <View className="px-5 pt-3 gap-2" style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

/** Empty state with the mascot. */
export function Empty({ title, body, mood = 'normal', action }: { title: string; body?: string; mood?: 'normal' | 'happy' | 'sleepy'; action?: ReactNode }) {
  return (
    <View className="items-center gap-3 py-6 px-4">
      <Mascot size={88} mood={mood} />
      <Text variant="sheet" className="text-center">
        {title}
      </Text>
      {body ? (
        <Text tone="ink2" className="text-center max-w-[300px]">
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

/** Skeleton line: only on the very first load, never a full-screen spinner. */
export function Skeleton({ className, width }: { className?: string; width?: number }) {
  return <View className={cn('bg-surface-sunken rounded-md h-4', className)} style={width ? { width } : undefined} />;
}
