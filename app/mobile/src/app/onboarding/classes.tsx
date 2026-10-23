import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useAddClass, useClasses, useMe, useSources } from '@/api/hooks';
import { Check, Chip } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Inputs';
import { Card, Row } from '@/components/ui/Layout';
import { Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useFinishOnboarding } from '@/lib/onboarding';

/** Step 3: one or more classes. Also used from Ik → Roosterbronnen (from=settings). */
export default function ClassesStep() {
  const { t } = useT();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const settings = from === 'settings';
  const me = useMe();
  const classes = useClasses(me.data?.school_id ?? null);
  const sources = useSources();
  const add = useAddClass();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { finish } = useFinishOnboarding();

  const have = useMemo(() => new Set((sources.data ?? []).map((s) => s.class_id).filter(Boolean) as number[]), [sources.data]);
  const byId = useMemo(() => new Map((classes.data ?? []).map((c) => [c.id, c])), [classes.data]);
  const needle = q.trim().toLowerCase();
  const shown = (classes.data ?? [])
    .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.long_name.toLowerCase().includes(needle))
    .slice(0, 60);
  const chosen = [...have, ...picked];

  function toggle(id: number) {
    if (have.has(id)) return;
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function next() {
    setError(null);
    try {
      for (const id of picked) await add.mutateAsync({ class_id: id });
      if (settings) router.back();
      else router.push('/onboarding/courses');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.tryAgain'));
    }
  }

  const label = settings ? t('classes.add', { n: picked.length }) : t('classes.next', { n: chosen.length });
  return (
    <Screen
      back
      progress={settings ? undefined : [3, 6]}
      navRight={settings ? undefined : <Button variant="ghost" size="sm" label={t('common.skip')} onPress={finish} />}
      navTitle={settings ? t('classes.addTitle') : undefined}
      footer={<Button label={label} disabled={settings ? picked.length === 0 : chosen.length === 0} loading={add.isPending} onPress={next} />}
    >
      <View className="gap-2">
        <Text variant="title" accessibilityRole="header">
          {t('classes.title')}
        </Text>
        <Text tone="ink2">{t('classes.body')}</Text>
      </View>
      <Input icon="search" placeholder={t('classes.search')} accessibilityLabel={t('classes.search')} value={q} onChangeText={setQ} autoCorrect={false} autoCapitalize="characters" />
      {chosen.length ? (
        <View className="flex-row flex-wrap gap-2" accessibilityLabel={t('classes.chosen')}>
          {chosen.map((id) => (
            <Chip
              key={id}
              state="on"
              label={byId.get(id)?.name ?? '…'}
              icon={have.has(id) ? 'check' : 'close'}
              accessibilityLabel={have.has(id) ? byId.get(id)?.name : t('classes.remove', { name: byId.get(id)?.name ?? '' })}
              onPress={() => toggle(id)}
            />
          ))}
        </View>
      ) : null}
      {error ? (
        <Text variant="sm" tone="danger">
          {error}
        </Text>
      ) : null}
      <Card>
        {classes.isPending ? (
          <View className="p-4 gap-3">
            <Skeleton className="w-1/2" />
            <Skeleton className="w-2/3" />
            <Skeleton className="w-1/3" />
          </View>
        ) : shown.length === 0 ? (
          <Row first title={t('classes.none')} sub={t('classes.noneBody')} />
        ) : (
          shown.map((c, i) => {
            const on = have.has(c.id) || picked.includes(c.id);
            return (
              <Row
                key={c.id}
                first={i === 0}
                title={c.name}
                sub={c.long_name || undefined}
                left={<Check on={on} />}
                onPress={() => toggle(c.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: have.has(c.id) }}
              />
            );
          })
        )}
      </Card>
    </Screen>
  );
}
