import { router } from 'expo-router';
import { View } from 'react-native';

import { useMe, useSchedule, useSources } from '@/api/hooks';
import { Legend } from '@/components/timetable/Timetable';
import { WeekView } from '@/components/timetable/WeekView';
import { Mascot } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Layout';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { useFinishOnboarding } from '@/lib/onboarding';
import { addDays, isoDay, monday } from '@/lib/time';

/** Step 5, the "aha": your week, right away. */
export default function WeekStep() {
  const { t } = useT();
  const now = new Date();
  // At the weekend, show the coming week
  const start = monday(now.getDay() === 0 || now.getDay() === 6 ? addDays(now, 3) : now);
  const schedule = useSchedule(isoDay(start), 5);
  const sources = useSources();
  const lessons = (schedule.data?.lessons ?? []).filter((l) => l.course !== undefined);
  const classNames = (sources.data ?? []).filter((s) => s.kind === 'untis').map((s) => s.label).join(' + ');
  const syncing = schedule.data?.sources.syncing;
  const me = useMe();
  const { finish, busy } = useFinishOnboarding();
  // Guests can't add friends yet: the friends step comes later, from Today
  const next = () => (me.data?.guest ? finish() : router.push('/onboarding/friends'));
  return (
    <Screen
      back
      progress={[5, 6]}
      navRight={<Button variant="ghost" size="sm" label={t('common.skip')} onPress={finish} />}
      footer={<Button label={t('week.next')} loading={busy} onPress={next} />}
    >
      <View className="flex-row items-end gap-3">
        <View className="flex-1 gap-1">
          <Text variant="titleXl" accessibilityRole="header">
            {t('week.title')}
          </Text>
          <Text tone="ink2">
            {syncing ? t('week.fetching') : t('week.count', { n: lessons.length, classes: classNames })}
          </Text>
        </View>
        <Mascot size={64} mood="happy" />
      </View>
      <Card className="p-2.5">
        <WeekView monday={start} lessons={lessons} todayIso={isoDay(now)} nowMin={null} pxPerHour={36} />
      </Card>
      <Legend items={['theory', 'lab']} />
      <Text bold tone="you" variant="sm" className="underline" accessibilityRole="link" onPress={() => router.back()}>
        {t('week.fix')}
      </Text>
    </Screen>
  );
}
