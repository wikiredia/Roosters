import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useMe } from '@/api/hooks';
import { Mascot } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { resetTo } from '@/lib/nav';
import { clearSession } from '@/lib/session';

/**
 * After signing in, when the account isn't what you asked for (lib/onboarding.routeAfterSignIn):
 * - kind=existing: 'Create an account' (or a guest adding their e-mail) with an address that already had an account.
 *   You're signed in to that account; we only say so. guest=1: what you set up as a guest was added where the account
 *   had nothing (accounts.fold_guest).
 * - kind=new: 'I already have an account', but there was none: one was just made. Keep it, or try another address or
 *   way: the new, empty account is deleted again (DELETE /me) and you're back at signing in.
 */
export default function Found() {
  const { t } = useT();
  const { kind, email, guest } = useLocalSearchParams<{ kind?: string; email?: string; guest?: string }>();
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = kind !== 'new';

  async function tryAnother() {
    setBusy(true);
    setError(null);
    try {
      await api.del('/api/v1/me');
      await clearSession();
      resetTo({ pathname: '/login', params: { mode: 'login' } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.offline'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      noBanner
      footer={
        existing ? (
          <Button label={t('found.continue')} onPress={() => resetTo('/')} />
        ) : (
          <>
            <Button variant="secondary" label={t('found.other')} loading={busy} onPress={tryAnother} />
            <Button label={t('found.keep')} disabled={busy} onPress={() => resetTo('/')} />
          </>
        )
      }
    >
      <View className="items-center pt-6">
        <Mascot size={120} mood={existing ? 'happy' : 'normal'} />
      </View>
      <View className="gap-2">
        <Text variant="title" accessibilityRole="header">
          {existing ? (me.data?.display_name ? t('found.existingTitleName', { name: me.data.display_name }) : t('found.existingTitle')) : t('found.newTitle')}
        </Text>
        <Text tone="ink2">{existing ? t('found.existingBody') : email ? t('found.newBody', { email }) : t('found.newBodyOther')}</Text>
        {existing && guest ? <Text tone="ink2">{t('found.existingGuest')}</Text> : null}
      </View>
      {error ? (
        <Text variant="sm" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}
