import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Tokens } from '@/api/types';
import { Mascot, Wordmark } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { saveTokens } from '@/lib/session';

const LEGAL_URL = process.env.EXPO_PUBLIC_LEGAL_URL ?? 'https://github.com/wikiredia/Roosters';

export default function Welcome() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [apple, setApple] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setApple).catch(() => {});
  }, []);

  async function signInWithApple() {
    setError(null);
    try {
      // Apple gets the hash of a one-time value, our server the value itself: a stolen token can't be replayed
      const raw = Crypto.randomUUID();
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashed,
      });
      if (!cred.identityToken) return;
      const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') || undefined;
      const tokens = await api.post<Tokens>(
        '/api/v1/auth/apple',
        { id_token: cred.identityToken, nonce: raw, name, platform: 'ios', device_name: 'iPhone' },
        { auth: false },
      );
      await saveTokens(tokens);
      router.replace('/');
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      setError(e instanceof ApiError ? e.message : t('common.tryAgain'));
    }
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
      <View className="px-5 pt-1 pb-3 min-h-14 justify-center">
        <Wordmark size={24} />
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
        {apple ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={{ height: 52 }}
            onPress={signInWithApple}
          />
        ) : null}
        <Button variant={apple ? 'secondary' : 'primary'} icon="mail" label={t('welcome.email')} onPress={() => router.push('/login/email')} />
        {error ? (
          <Text variant="sm" tone="danger" className="text-center">
            {error}
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
