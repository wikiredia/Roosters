import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Linking, View } from 'react-native';

import { usePush, useSetPush } from '@/api/hooks';
import { Banner } from '@/components/ui/Bits';
import { AppIcon } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Inputs';
import { Card, ListHead, Row } from '@/components/ui/Layout';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT, type Key } from '@/i18n';
import { useFinishOnboarding } from '@/lib/onboarding';
import { pushState, registerPush } from '@/lib/push';

/**
 * Step 8, the last one: notifications, asked in context. First what you'll get (two example pushes, the three
 * Meldingen toggles), and the phone's own question only after "Zet meldingen aan". A no from the phone is not asked
 * again: then how to turn it on in the phone's settings. From Today (`from=settings`): no progress, back when done.
 */
export default function NotificationsStep() {
  const { t } = useT();
  const fromToday = useLocalSearchParams<{ from?: string }>().from === 'settings';
  const state = pushState.use();
  const push = usePush();
  const set = useSetPush();
  const { finish, busy } = useFinishOnboarding();
  const [asking, setAsking] = useState(false);
  const s = push.data?.settings;

  const done = () => (fromToday ? router.back() : finish());

  useEffect(() => {
    // Where do we stand (allowed already?), and again when back from the phone's settings
    registerPush();
    const sub = AppState.addEventListener('change', (a) => {
      if (a === 'active') registerPush();
    });
    return () => sub.remove();
  }, []);

  async function allow() {
    setAsking(true);
    const r = await registerPush(true);
    setAsking(false);
    push.refetch();
    // Allowed (or nothing more to ask on this phone): on to Today. A no shows how to turn it on, no second question
    if (r !== 'denied' && r !== 'undetermined') done();
  }

  const asked = state === 'granted' || state === 'denied';
  const unavailable = state === 'unsupported' || state === 'noProject' || state === 'failed';

  return (
    <Screen
      back
      progress={fromToday ? undefined : [8, 8]}
      navRight={fromToday || asked ? undefined : <Button variant="ghost" size="sm" label={t('common.skip')} onPress={done} />}
      footer={
        asked || unavailable ? (
          <Button label={t('common.next')} loading={busy} onPress={done} />
        ) : (
          <>
            <Button icon="bell" label={t('push.enable')} loading={asking || state === 'unknown'} onPress={allow} />
            <Button variant="ghost" label={t('pushStep.notNow')} disabled={busy} onPress={done} />
          </>
        )
      }
    >
      <View className="gap-2">
        <Text variant="title" accessibilityRole="header">
          {state === 'granted' ? t('pushStep.onTitle') : t('pushStep.title')}
        </Text>
        <Text tone="ink2">{t('pushStep.body')}</Text>
      </View>

      {state === 'denied' ? (
        <Card className="p-4 gap-3">
          <Text bold>{t('push.deniedTitle')}</Text>
          <Text variant="sm" tone="ink2">
            {t('push.deniedBody')}
          </Text>
          <Button variant="secondary" icon="bell" label={t('push.openSettings')} onPress={() => Linking.openSettings()} />
        </Card>
      ) : unavailable ? (
        <Banner icon="bell" title={state === 'noProject' ? t('push.noProject') : t('push.unavailable')} />
      ) : (
        <View className="gap-2" accessible accessibilityLabel={[t('pushStep.preview'), t('pushStep.example1Title'), t('pushStep.example1Body'), t('pushStep.example2Title'), t('pushStep.example2Body')].join('. ')}>
          <Text variant="eyebrow">{t('pushStep.preview')}</Text>
          <Example title="pushStep.example1Title" body="pushStep.example1Body" answers />
          <Example title="pushStep.example2Title" body="pushStep.example2Body" />
        </View>
      )}

      {s && !unavailable ? (
        <View>
          <ListHead>{t('push.what')}</ListHead>
          <Card>
            <Row first title={t('push.requests')} sub={t('push.requestsSub')} right={<Toggle value={s.requests} onChange={(v) => set.mutate({ requests: v })} label={t('push.requests')} />} />
            <Row title={t('push.changes')} sub={t('push.changesSub')} right={<Toggle value={s.changes} onChange={(v) => set.mutate({ changes: v })} label={t('push.changes')} />} />
            <Row title={t('push.chat')} sub={t('push.chatSub')} right={<Toggle value={s.chat} onChange={(v) => set.mutate({ chat: v })} label={t('push.chat')} />} />
          </Card>
        </View>
      ) : null}

      <Text variant="sm" tone="ink2">
        {t('pushStep.later')}
      </Text>
    </Screen>
  );
}

/** A made-up push as it will look on the lock screen; `answers`: the Ja / Nee of a break request. */
function Example({ title, body, answers }: { title: Key; body: Key; answers?: boolean }) {
  const { t } = useT();
  return (
    <Card className="p-3 gap-2.5">
      <View className="flex-row gap-3">
        <AppIcon size={36} />
        <View className="flex-1 gap-0.5">
          <View className="flex-row justify-between">
            <Text variant="xs" bold tone="ink2">
              Roosters+
            </Text>
            <Text variant="xs" tone="ink3">
              {t('pushStep.now')}
            </Text>
          </View>
          <Text variant="sm" bold>
            {t(title)}
          </Text>
          <Text variant="sm" tone="ink2">
            {t(body)}
          </Text>
        </View>
      </View>
      {answers ? (
        <View className="flex-row gap-2">
          {(['push.yes', 'push.no'] as const).map((k) => (
            <View key={k} className="flex-1 items-center rounded-[10px] bg-surface-sunken py-1.5">
              <Text variant="sm" bold>
                {t(k)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
