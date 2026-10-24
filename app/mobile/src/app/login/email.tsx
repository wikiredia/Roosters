import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { GoogleButton } from '@/components/GoogleButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Inputs';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { api, ApiError, NetworkError } from '@/lib/api';
import { describe } from '@/lib/debuglog';
import { googleSupport } from '@/lib/google';
import { resetTo } from '@/lib/nav';
import { startAsGuest } from '@/lib/onboarding';
import { debugEnabled } from '@/lib/server';
import { session } from '@/lib/session';

export default function EmailLogin() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [detail, setDetail] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  // Already in the app as a guest (from Today's steps): no onboarding progress, no skip
  const { from } = useLocalSearchParams<{ from?: string }>();
  const inApp = from === 'steps' || session.get().status === 'signedIn';
  // A guest can also keep their account with Google (welcome has the button for everyone else)
  const google = inApp && googleSupport() === 'ready';

  async function skip() {
    setBusy(true);
    setError(undefined);
    try {
      await startAsGuest();
      resetTo('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.offline'));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const value = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(value)) {
      setError(t('login.emailInvalid'));
      return;
    }
    setBusy(true);
    setError(undefined);
    setDetail(null);
    try {
      await api.post('/api/v1/auth/email/start', { email: value }, { auth: false });
      router.push({ pathname: '/login/code', params: { email: value, ...(inApp ? { from: 'steps' } : {}) } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof NetworkError ? t('common.offline') : t('common.tryAgain'));
      if (debugEnabled) setDetail(e instanceof NetworkError && e.log ? describe(e.log) : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      back
      progress={inApp ? undefined : [1, 7]}
      navTitle={inApp ? t('steps.email') : undefined}
      navRight={inApp ? undefined : <Button variant="ghost" size="sm" label={t('common.skip')} onPress={skip} />}
      noBanner
    >
      <Text variant="title" accessibilityRole="header">
        {t('login.emailTitle')}
      </Text>
      <Text tone="ink2" className="-mt-4">
        {t('login.emailBody')}
      </Text>
      <Input
        label={t('login.emailLabel')}
        value={email}
        onChangeText={setEmail}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={send}
        hint={t('login.emailHint')}
        error={error}
      />
      <Button label={t('login.sendCode')} onPress={send} loading={busy} />
      {google ? (
        <View className="gap-3">
          <Text variant="sm" tone="ink3" className="text-center">
            {t('login.or')}
          </Text>
          <GoogleButton
            onError={(message, why) => {
              setGoogleError(message);
              setDetail(debugEnabled && why ? why : null);
            }}
          />
          {googleError ? (
            <Text variant="sm" tone="danger" className="text-center" accessibilityLiveRegion="polite">
              {googleError}
            </Text>
          ) : null}
        </View>
      ) : null}
      {detail ? (
        <View className="gap-1">
          <Text variant="xs" tone="ink2" selectable>
            {detail}
          </Text>
          <Text variant="sm" bold tone="you" accessibilityRole="link" onPress={() => router.push('/debug')}>
            Server & debug
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
