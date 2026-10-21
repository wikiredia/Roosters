import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import type { Tokens } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { CodeInput } from '@/components/ui/Inputs';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { api, ApiError, NetworkError } from '@/lib/api';
import { saveTokens } from '@/lib/session';

const RESEND_AFTER = 60;

export default function CodeLogin() {
  const { t } = useT();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_AFTER);
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Six digits: check right away (once per code, also after a paste)
    if (code.length === 6 && sent.current !== code) {
      sent.current = code;
      verify(code);
    }
  }, [code]);

  async function verify(value: string) {
    setBusy(true);
    setError(null);
    try {
      const tokens = await api.post<Tokens>(
        '/api/v1/auth/email/verify',
        { email, code: value, platform: Platform.OS, device_name: Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Web' },
        { auth: false },
      );
      await saveTokens(tokens);
      router.replace('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof NetworkError ? t('common.offline') : t('common.tryAgain'));
      setCode('');
      sent.current = null;
    } finally {
      setBusy(false);
    }
  }

  async function paste() {
    const text = await Clipboard.getStringAsync();
    const digits = text.replace(/\D/g, '').slice(0, 6);
    if (digits) setCode(digits);
  }

  async function resend() {
    setWait(RESEND_AFTER);
    try {
      await api.post('/api/v1/auth/email/start', { email }, { auth: false });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.offline'));
    }
  }

  const mm = `${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`;
  return (
    <Screen back progress={[1, 6]} noBanner>
      <View className="gap-2">
        <Text variant="title" accessibilityRole="header">
          {t('login.codeTitle')}
        </Text>
        <Text tone="ink2">
          {t('login.codeSent')}{' '}
          <Text bold>{email}</Text>.
        </Text>
        <Text bold tone="you" className="underline" accessibilityRole="link" onPress={() => router.back()}>
          {t('login.otherEmail')}
        </Text>
      </View>
      <View className="gap-3">
        <CodeInput value={code} onChange={setCode} error={!!error} />
        {error ? (
          <Text variant="sm" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <View className="flex-row">
          <Button variant="secondary" size="sm" icon="copy" label={t('login.paste')} onPress={paste} loading={busy} />
        </View>
      </View>
      <View className="gap-1">
        {wait > 0 ? (
          <Text tone="ink2">
            {t('login.resendIn')} <Text bold>{mm}</Text>
          </Text>
        ) : (
          <View className="flex-row">
            <Button variant="ghost" size="sm" label={t('login.resend')} onPress={resend} className="px-0" />
          </View>
        )}
        <Text variant="sm" tone="ink3">
          {t('login.spam')}
        </Text>
      </View>
    </Screen>
  );
}
