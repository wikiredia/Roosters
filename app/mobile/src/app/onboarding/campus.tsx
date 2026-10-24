import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { useCampuses, useMe, useSchools, useUpdateMe } from '@/api/hooks';
import { Radio } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Card, Row } from '@/components/ui/Layout';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';

const UNKNOWN = -1;

export default function CampusStep() {
  const { t } = useT();
  const settings = useLocalSearchParams<{ from?: string }>().from === 'settings';
  const me = useMe();
  const schoolId = me.data?.school_id ?? null;
  const campuses = useCampuses(schoolId);
  const school = useSchools().data?.find((s) => s.id === schoolId);
  const update = useUpdateMe();
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    if (picked == null && me.data?.campus_id) setPicked(me.data.campus_id);
  }, [me.data?.campus_id]);

  async function next() {
    await update.mutateAsync({ campus_id: picked === UNKNOWN ? null : picked });
    if (settings) router.back();
    else router.push('/onboarding/classes');
  }

  const options = [...(campuses.data ?? []).map((c) => ({ id: c.id, name: c.name })), { id: UNKNOWN, name: t('campus.unknown') }];
  return (
    <Screen
      back
      progress={settings ? undefined : [3, 8]}
      navRight={settings ? undefined : <Button variant="ghost" size="sm" label={t('common.skip')} onPress={() => router.push('/onboarding/classes')} />}
      footer={<Button label={settings ? t('common.save') : t('common.next')} disabled={picked == null} loading={update.isPending} onPress={next} />}>
      <Text variant="title" accessibilityRole="header">
        {t('campus.title')}
      </Text>
      <Text tone="ink2" className="-mt-4">
        {t('campus.body', { school: school?.name ?? '' })}
      </Text>
      <Card>
        {options.map((c, i) => (
          <Row
            key={c.id}
            first={i === 0}
            title={c.name}
            sub={c.id === UNKNOWN ? t('campus.later') : undefined}
            left={<Icon name="pin" size={22} color={picked === c.id ? 'you-ink' : 'ink-3'} />}
            right={<Radio on={picked === c.id} />}
            onPress={() => setPicked(c.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: picked === c.id }}
          />
        ))}
      </Card>
    </Screen>
  );
}
