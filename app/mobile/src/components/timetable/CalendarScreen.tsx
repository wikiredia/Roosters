import { type ReactNode, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Easing, FadeInLeft, FadeInRight, FadeOutLeft, FadeOutRight, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useSourceRefresh } from '@/api/hooks';
import { Calendar, type CalendarControl, type CalendarView, rangeLabel } from '@/components/timetable/Calendar';
import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { APressable, AView, usePressScale } from '@/components/ui/Motion';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { dateAt, dayIndex, homeStart } from '@/lib/days';

type Props = {
  title: string;
  /** Top right (Rooster: 'Vergelijk'; Vergelijken: the faces you compare with, and +) */
  right?: ReactNode;
  /** A back arrow before the title (Vergelijken: there's no swiping back, it would get mixed up with swiping through
   * the days) */
  onBack?: () => void;
  /** Passed on to the calendar: Vergelijken's friends, where it starts, and remembering your number of days (Rooster) */
  compare?: number[];
  initialStart?: number;
  initialDays?: number;
  remember?: boolean;
};

/**
 * The screen around the calendar, the same for the Rooster tab and Vergelijken (app/(tabs)/rooster.tsx,
 * app/compare.tsx): the dates in view above the large title, the title turning into 'Reset' once you've changed the
 * view, the refresh button next to it, something on the right, and the calendar (components/timetable/Calendar) with
 * the rest of the height. One component, so both screens always look and work the same; only what's in them differs.
 */
export function CalendarScreen({ title, right, onBack, compare, initialStart, initialDays = 5, remember = false }: Props) {
  const { t, lang } = useT();
  const control = useRef<CalendarControl>(null);
  const [view, setView] = useState<CalendarView>(() => ({ start: initialStart ?? homeStart(initialDays, dayIndex(new Date()), () => true), want: initialDays, custom: false }));
  return (
    <Screen
      title={title}
      heading={
        <View className="flex-shrink flex-row items-end gap-2">
          {onBack ? <IconButton icon="back" label={t('common.back')} onPress={onBack} className="w-9 h-11 -ml-2" /> : null}
          <TitleOrBack title={title} back={view.custom ? t('rooster.reset') : null} hint={t('rooster.resetHint')} onBack={() => control.current?.reset()} />
          <RefreshButton />
        </View>
      }
      eyebrow={rangeLabel(dateAt(view.start), dateAt(view.start + view.want - 1), lang)}
      right={right}
      scroll={false}
      contentClassName="flex-1 gap-2 pb-3"
    >
      <Calendar remember={remember} compare={compare} initialStart={initialStart} initialDays={initialDays} control={control} onView={setView} />
    </Screen>
  );
}

/**
 * A small refresh button next to the title (or 'Reset'): fetches the timetable again from where it comes from (Untis,
 * your calendar links), not only from our API (`useSourceRefresh`). The arrow turns while it works.
 */
function RefreshButton() {
  const { t } = useT();
  const { run, busy } = useSourceRefresh();
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (busy && !reduced) turn.set(withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1));
    else turn.set(withTiming(0, { duration: 0 }));
  }, [busy, reduced, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  return (
    <AView style={spin} className="mb-1">
      <IconButton icon="refresh" label={t('rooster.refresh')} accessibilityState={{ busy }} onPress={run} className="w-8 h-8" />
    </AView>
  );
}

/**
 * The large title, or 'Reset' (the arrow curling left) once you've changed the view: the one slides out as the
 * other slides in, in the same place. 'Reset' goes back to the standard view.
 */
function TitleOrBack({ title, back, hint, onBack }: { title: string; back: string | null; hint: string; onBack: () => void }) {
  const press = usePressScale();
  return (
    <View className="flex-shrink min-h-11 justify-end">
      {back ? (
        <APressable
          key="back"
          entering={FadeInRight.duration(220)}
          exiting={FadeOutRight.duration(160)}
          accessibilityRole="button"
          accessibilityLabel={back}
          accessibilityHint={hint}
          hitSlop={8}
          onPress={onBack}
          {...press.handlers}
          style={press.style}
          className="flex-row items-center gap-1.5"
        >
          <Icon name="undo" size={26} color="you-ink" strokeWidth={2} />
          <Text variant="title" tone="you" numberOfLines={1}>
            {back}
          </Text>
        </APressable>
      ) : (
        <AView key="title" entering={FadeInLeft.duration(220)} exiting={FadeOutLeft.duration(160)}>
          <Text variant="title" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
        </AView>
      )}
    </View>
  );
}
