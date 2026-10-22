import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Inputs';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { api, ApiError, NetworkError } from '@/lib/api';
import { describe } from '@/lib/debuglog';
import { debugEnabled } from '@/lib/server';

export default function EmailLogin() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [detail, setDetail] = useState<string | null>(null);

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
      router.push({ pathname: '/login/code', params: { email: value } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof NetworkError ? t('common.offline') : t('common.tryAgain'));
      if (debugEnabled) setDetail(e instanceof NetworkError && e.log ? describe(e.log) : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen back progress={[1, 6]} noBanner>
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
