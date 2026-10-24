import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useMe, useSchools, useUpdateMe } from '@/api/hooks';
import { Radio } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Inputs';
import { Card, ListHead, Row } from '@/components/ui/Layout';
import { Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { useFinishOnboarding } from '@/lib/onboarding';

/** Step 3: your school (Untis). Skippable: without one you can still add your own calendar link.
 * Also opened from Today's steps (from=settings). */
export default function SchoolStep() {
  const { t } = useT();
  const settings = useLocalSearchParams<{ from?: string }>().from === 'settings';
  const { finish } = useFinishOnboarding();
  const me = useMe();
  const schools = useSchools();
  const update = useUpdateMe();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (picked == null && me.data?.school_id) setPicked(me.data.school_id);
  }, [me.data?.school_id]);

  const list = (schools.data ?? []).filter((s) => !q.trim() || `${s.name} ${s.short_name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const [suggested, ...rest] = list;

  async function next() {
    if (picked == null) return;
    await update.mutateAsync({ school_id: picked });
    if (settings) router.replace({ pathname: '/onboarding/campus', params: { from: 'settings' } });
    else router.push('/onboarding/campus');
  }

  const row = (s: { id: number; name: string }, first: boolean) => (
    <Row
      key={s.id}
      first={first}
      title={s.name}
      sub={t('school.viaUntis')}
      right={<Radio on={picked === s.id} />}
      onPress={() => setPicked(s.id)}
      accessibilityRole="radio"
      accessibilityState={{ checked: picked === s.id }}
    />
  );

  return (
    <Screen
      back
      progress={settings ? undefined : [3, 7]}
      navRight={settings ? undefined : <Button variant="ghost" size="sm" label={t('common.skip')} onPress={finish} />}
      footer={<Button label={t('common.next')} disabled={picked == null} loading={update.isPending} onPress={next} />}>
      <Text variant="title" accessibilityRole="header">
        {t('school.title')}
      </Text>
      <Input icon="search" placeholder={t('school.search')} accessibilityLabel={t('school.search')} value={q} onChangeText={setQ} autoCorrect={false} />
      {schools.isPending ? (
        <Card className="p-4 gap-3">
          <Skeleton className="w-2/3" />
          <Skeleton className="w-1/3" />
        </Card>
      ) : (
        <>
          {suggested ? (
            <View>
              <ListHead>{t('school.suggested')}</ListHead>
              <Card>{row(suggested, true)}</Card>
            </View>
          ) : null}
          {rest.length ? (
            <View>
              <ListHead>{t('school.all')}</ListHead>
              <Card>{rest.map((s, i) => row(s, i === 0))}</Card>
            </View>
          ) : null}
        </>
      )}
      <Text bold tone="you" variant="sm" className="underline" accessibilityRole="button" onPress={() => setMissing(true)}>
        {t('school.missing')}
      </Text>
      {missing ? (
        <View className="gap-3">
          <Text variant="sm" tone="ink2">
            {t('school.missingBody')}
          </Text>
          <View className="flex-row">
            <Button variant="secondary" size="sm" icon="link" label={t('sources.addLink')} onPress={() => router.push({ pathname: '/settings/sources', params: { add: 'link' } })} />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
