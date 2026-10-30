import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mascot, Wordmark } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useDebug } from '@/lib/server';
import { resetTo } from '@/lib/nav';
import { session } from '@/lib/session';
import { startAsGuest } from '@/lib/onboarding';

const LEGAL_URL = process.env.EXPO_PUBLIC_LEGAL_URL ?? 'https://github.com/wikiredia/Roosters';

/**
 * The first screen: two clear ways in, 'Create an account' and 'I already have an account' (both go to /login, which
 * has Apple, Google and e-mail for that choice), and going in as a guest. Picking the 'wrong' one is fine: the
 * server finds an account by its verified address either way, and login/found.tsx says what happened.
 */
export default function Welcome() {
  const debug = useDebug();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  const [guestBusy, setGuestBusy] = useState(false);
  // Here because the server ended the session (not because you signed out yourself): say so
  const s = session.use();
  const ended = s.status === 'signedOut' && s.ended ? s.ended : null;

  /** On campus, on the way to class: straight in, sign in later from Today */
  async function continueAsGuest() {
    setError(null);
    setGuestBusy(true);
    try {
      await startAsGuest();
      resetTo('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.offline'));
    } finally {
      setGuestBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
      <View className="px-5 pt-1 pb-3 min-h-14 flex-row items-center justify-between">
        <Wordmark size={24} />
        {debug ? <Button variant="ghost" size="sm" icon="wifi" label="Server & debug" onPress={() => router.push('/debug')} /> : null}
      </View>
      <View className="flex-1 justify-end px-5 pb-7 gap-7">
        <View className="items-center">
          <Mascot size={168} />
          <View className="w-[260px] h-3.5 rounded-full bg-together -mt-0.5" />
        </View>
        <View className="items-center gap-3">
          <Text variant="titleXl" className="text-center">
            {t('welcome.title')}
          </Text>
          <Text tone="ink2" className="text-center max-w-[320px]">
            {t('welcome.body')}
          </Text>
        </View>
      </View>
      <View className="px-5 gap-2">
        <Button icon="user" label={t('welcome.create')} onPress={() => router.push({ pathname: '/login', params: { mode: 'new' } })} />
        <Button variant="secondary" label={t('welcome.login')} onPress={() => router.push({ pathname: '/login', params: { mode: 'login' } })} />
        <Button variant="ghost" label={t('welcome.guest')} loading={guestBusy} onPress={continueAsGuest} />
        {error ? (
          <Text variant="sm" tone="danger" className="text-center">
            {error}
          </Text>
        ) : ended ? (
          <Text variant="sm" tone="ink2" className="text-center">
            {t(ended === 'reuse' ? 'welcome.endedElsewhere' : 'welcome.ended')}
          </Text>
        ) : null}
        <Text variant="xs" tone="ink2" className="text-center pt-1.5">
          {t('welcome.legal')}{' '}
          <Text variant="xs" bold tone="you" className="underline" onPress={() => Linking.openURL(LEGAL_URL)}>
            {t('welcome.legalLink')}
          </Text>
        </Text>
      </View>
    </View>
  );
}
