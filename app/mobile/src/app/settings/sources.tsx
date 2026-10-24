import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAddIcs, useDeleteSource, useRefresh, useSources } from '@/api/hooks';
import type { Source } from '@/api/types';
import { Banner, IconTile } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Inputs';
import { Card, ListHead, Row } from '@/components/ui/Layout';
import { Screen, Skeleton } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { minutesAgo } from '@/lib/time';

type T = ReturnType<typeof useT>['t'];

function updated(s: Source, t: T) {
  if (s.syncing) return t('sources.fetching');
  const m = minutesAgo(s.last_ok);
  if (m == null) return t('sources.never');
  if (m < 1) return t('today.updatedNow');
  if (m < 120) return t('today.updatedMin', { n: m });
  if (m < 48 * 60) return t('today.updatedHours', { n: Math.round(m / 60) });
  return t('sources.updatedDays', { n: Math.round(m / 1440) });
}

/** Roosterbronnen: classes from Untis and personal calendar links. */
export default function SourcesScreen() {
  const { t } = useT();
  const sources = useSources();
  const refresh = useRefresh();
  const del = useDeleteSource();
  // ?add=link: opened from "Can't find your school?" with the link sheet already open
  const [adding, setAdding] = useState(useLocalSearchParams<{ add?: string }>().add === 'link');
  const list = sources.data ?? [];
  const classes = list.filter((s) => s.kind === 'untis');
  const links = list.filter((s) => s.kind === 'ics');
  const failing = list.some((s) => s.error);

  async function removeLink(s: Source) {
    if (await confirm(t('sources.removeLinkConfirm', { name: s.label }), t('sources.removeLinkSub'), t('sources.remove'), t('common.cancel'))) {
      del.mutate(s.id);
    }
  }

  return (
    <Screen back navTitle={t('me.sources')} onRefresh={() => sources.refetch()}>
      {failing ? (
        <Banner
          icon="wifiOff"
          title={t('sources.untisDown')}
          body={t('today.lastKnown')}
          action={<Button variant="secondary" size="sm" label={t('common.tryAgain')} loading={refresh.isPending} onPress={() => refresh.mutate(undefined, { onSettled: () => sources.refetch() })} />}
        />
      ) : null}

      <View>
        <ListHead>{t('sources.classes')}</ListHead>
        <Card>
          {!sources.data ? (
            <View className="p-4">
              <Skeleton width={160} />
            </View>
          ) : (
            classes.map((s, i) => (
              <Row
                key={s.id}
                first={i === 0}
                left={<IconTile name="calendar" />}
                title={s.label}
                sub={[s.semester ? t('sources.semester', { n: s.semester }) : null, s.config.exclude?.length ? t('sources.hidden', { n: s.config.exclude.length }) : t('sources.allCourses'), updated(s, t)].filter(Boolean).join(' · ')}
                chevron
                onPress={() => router.push({ pathname: '/onboarding/courses', params: { source: String(s.id), from: 'settings' } })}
              />
            ))
          )}
          <Row first={classes.length === 0 && !!sources.data} left={<IconTile name="plus" tone="you-ink" />} title={t('sources.addClass')} tone="you" onPress={() => router.push({ pathname: '/onboarding/classes', params: { from: 'settings' } })} />
        </Card>
      </View>

      <View>
        <ListHead>{t('sources.links')}</ListHead>
        <Card>
          {links.map((s, i) => (
            <Row
              key={s.id}
              first={i === 0}
              left={<IconTile name="link" />}
              title={s.label}
              sub={s.error ? t('sources.linkError') : updated(s, t)}
              right={<Button variant="ghost" size="sm" label={t('sources.remove')} onPress={() => removeLink(s)} />}
            />
          ))}
          <Row first={links.length === 0} left={<IconTile name="plus" tone="you-ink" />} title={t('sources.addLink')} tone="you" onPress={() => setAdding(true)} />
        </Card>
        <Text variant="sm" tone="ink2" className="pt-2">
          {t('sources.linksNote')}
        </Text>
      </View>

      <AddLinkSheet visible={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}

function AddLinkSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useT();
  const add = useAddIcs();
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await add.mutateAsync({ url: url.trim(), label: label.trim() || undefined });
      setUrl('');
      setLabel('');
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? (e.message || t('sources.badLink')) : t('common.offline'));
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t('common.close')} title={t('sources.addLink')} sub={t('sources.addLinkSub')}>
      <Input label={t('sources.linkLabel')} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://… .ics" error={error ?? undefined} />
      <Input label={t('sources.nameLabel')} hint={t('sources.nameHint')} value={label} onChangeText={setLabel} />
      <Button label={t('sources.addLink')} loading={add.isPending} disabled={!/^(https?|webcal):\/\//i.test(url.trim())} onPress={save} />
    </Sheet>
  );
}
