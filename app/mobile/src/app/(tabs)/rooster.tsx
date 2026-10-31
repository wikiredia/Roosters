import { router } from 'expo-router';

import { CalendarScreen } from '@/components/timetable/CalendarScreen';
import { Button } from '@/components/ui/Button';
import { useT } from '@/i18n';

/**
 * Rooster: your days in the calendar, with every friend's shared breaks (components/timetable/CalendarScreen, the
 * same screen Vergelijken uses). 'Vergelijk' (top right) picks friends and shows the same calendar with theirs next
 * to yours.
 */
export default function RoosterScreen() {
  const { t } = useT();
  return (
    <CalendarScreen
      title={t('tabs.rooster')}
      remember
      right={<Button size="sm" icon="users" label={t('rooster.compareShort')} accessibilityLabel={t('rooster.compare')} onPress={() => router.push('/compare')} />}
    />
  );
}
