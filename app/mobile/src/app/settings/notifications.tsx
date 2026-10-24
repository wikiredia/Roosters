import { useEffect } from 'react';
import { Linking, View } from 'react-native';

import { usePush, useSetPush } from '@/api/hooks';
import type { PushSettings } from '@/api/types';
import { Banner } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Inputs';
import { Card, ListHead, Row } from '@/components/ui/Layout';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { pushState, registerPush } from '@/lib/push';
import { hhmm } from '@/lib/time';

const STEP = 30;
const DAY = 24 * 60;
/** Quiet hours when you first turn them on */
const NIGHT = { quiet_from: 22 * 60, quiet_until: 7 * 60 + 30 };

/**
 * Meldingen: turn push on for this phone (asked only after a tap), what you want a push for, and quiet hours.
 * The settings are on the server (they hold for every phone you're signed in on); the bell per chat is in the chat.
 */
export default function NotificationsScreen() {
  const { t } = useT();
  const push = usePush();
  const set = useSetPush();
  const state = pushState.use();
  const s = push.data?.settings;

  useEffect(() => {
    // Back from the phone's settings, or the first time here: where do we stand?
    registerPush().then(() => push.refetch());
  }, []);

  async function enable() {
    if (state === 'denied') return Linking.openSettings();
    await registerPush(true);
    push.refetch();
  }

  function change(v: Partial<PushSettings>) {
    set.mutate(v);
  }

  const quietOn = s?.quiet_from != null && s?.quiet_until != null;

  return (
    <Screen back navTitle={t('me.notifications')}>
      {state === 'undetermined' || state === 'denied' ? (
        <Card className="p-4 gap-3">
          <Text bold>{state === 'denied' ? t('push.deniedTitle') : t('push.enableTitle')}</Text>
          <Text variant="sm" tone="ink2">
            {state === 'denied' ? t('push.deniedBody') : t('push.enableBody')}
          </Text>
          <Button icon="bell" label={state === 'denied' ? t('push.openSettings') : t('push.enable')} onPress={enable} />
        </Card>
      ) : state === 'unsupported' || state === 'noProject' || state === 'failed' ? (
        <Banner icon="bell" title={state === 'noProject' ? t('push.noProject') : t('push.unavailable')} />
      ) : null}

      <View>
        <ListHead>{t('push.what')}</ListHead>
        <Card>
          <Row first title={t('push.requests')} sub={t('push.requestsSub')} right={<Toggle value={s?.requests ?? true} onChange={(v) => change({ requests: v })} label={t('push.requests')} />} />
          <Row title={t('push.changes')} sub={t('push.changesSub')} right={<Toggle value={s?.changes ?? true} onChange={(v) => change({ changes: v })} label={t('push.changes')} />} />
          <Row title={t('push.chat')} sub={t('push.chatSub')} right={<Toggle value={s?.chat ?? true} onChange={(v) => change({ chat: v })} label={t('push.chat')} />} />
        </Card>
      </View>

      <View>
        <ListHead>{t('push.quiet')}</ListHead>
        <Card>
          <Row
            first
            title={t('push.quiet')}
            sub={t('push.quietSub')}
            right={<Toggle value={quietOn} onChange={(v) => change(v ? NIGHT : { quiet_from: null, quiet_until: null })} label={t('push.quiet')} />}
          />
          {quietOn && s ? (
            <>
              <QuietTime label={t('push.from')} value={s.quiet_from!} onChange={(m) => change({ quiet_from: m, quiet_until: s.quiet_until })} />
              <QuietTime label={t('push.until')} value={s.quiet_until!} onChange={(m) => change({ quiet_from: s.quiet_from, quiet_until: m })} />
            </>
          ) : null}
        </Card>
      </View>

      <Text variant="sm" tone="ink2">
        {t('push.comingLater')}
      </Text>
      {set.error ? (
        <Text variant="sm" bold tone="danger">
          {set.error.message}
        </Text>
      ) : null}
    </Screen>
  );
}

/** "Van 22:00  − +": half an hour a tap, round the clock. */
function QuietTime({ label, value, onChange }: { label: string; value: number; onChange: (m: number) => void }) {
  const { t } = useT();
  const step = (d: number) => onChange((value + d + DAY) % DAY);
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label} ${hhmm(value)}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? STEP : -STEP)}
    >
      <Row
        title={label}
        right={
          <View className="flex-row items-center gap-1">
            <IconButton icon="minus" label={t('push.earlier')} onPress={() => step(-STEP)} />
            <Text bold className="w-14 text-center">
              {hhmm(value)}
            </Text>
            <IconButton icon="plus" label={t('push.later')} onPress={() => step(STEP)} />
          </View>
        }
      />
    </View>
  );
}
