import { View } from 'react-native';
import type { FadeInLeft } from 'react-native-reanimated';

import { AView } from '@/components/ui/Motion';
import { Text } from '@/components/ui/Text';
import type { Key } from '@/i18n';
import { cn } from '@/lib/cn';

import { type Lane, soft } from './Lanes';
import { isOff, LessonBody, lessonLabel, type Span } from './Timetable';

type T = (k: Key, p?: Record<string, string | number>) => string;
const meets = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/**
 * A friend's lane in Vergelijken (inside a day column of the calendar, `DayGrid`): their classes in their own colour
 * (`Lanes.friendColor`), with as much of the name, details and time as fits (`LessonBody`), or just 'Les' when they
 * only share free/busy. Cancelled: dashed red; a class you asked them to skip: dashed and struck through, 'Gevraagd'
 * (only you see that, until they answer). Touches go to the grid (a tap opens the class's sheet, a drag to the bin
 * asks them to skip it); screen readers read each class.
 */
export function FriendLane({ lane, y, h0, h1, now, compact, entering, t }: { lane: Lane; y: (min: number) => number; h0: number; h1: number; now: number | null; compact: boolean; entering: ReturnType<typeof FadeInLeft.duration> | undefined; t: T }) {
  const color = lane.color ?? '#F0487A';
  return (
    <>
      {lane.lessons.map((l) => {
        const top = y(Math.max(l.start, h0 * 60));
        const h = Math.max(y(Math.min(l.end, h1 * 60)) - top - 3, 16);
        const asked = lane.asked.some((s) => meets(s, l));
        const off = isOff(l);
        const past = now != null && l.end <= now;
        return (
          <AView key={`${l.start}:${l.end}:${l.course ?? ''}`} entering={entering} style={{ position: 'absolute', top, height: h, left: 2, right: 2 }} accessible accessibilityLabel={[lessonLabel(l, t), asked ? t('compare.askedTag') : null].filter(Boolean).join(', ')}>
            <View
              pointerEvents="none"
              className={cn(compact ? 'rounded-[6px] px-1.5 py-1' : 'rounded-block px-2.5 py-1.5', 'flex-1 overflow-hidden border-[1.5px]', (asked || off) && 'border-dashed', off && !asked && 'bg-surface border-danger', past && 'opacity-55')}
              style={asked ? { borderColor: color } : off ? undefined : { backgroundColor: soft(color), borderColor: color }}
            >
              {asked ? (
                <>
                  <Text variant="xs" bold strike tone="ink3" numberOfLines={2}>
                    {l.course ?? t('tt.lesson')}
                  </Text>
                  <Text variant="xs" tone="ink3" numberOfLines={1}>
                    {t('compare.askedTag')}
                  </Text>
                </>
              ) : (
                <LessonBody lesson={l} compact={compact} t={t} friend />
              )}
            </View>
          </AView>
        );
      })}
    </>
  );
}
