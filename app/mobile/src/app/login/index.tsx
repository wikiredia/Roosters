import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import type { Tokens } from '@/api/types';
import { GoogleButton } from '@/components/GoogleButton';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { googleSupport } from '@/lib/google';
import { afterSignIn, type AuthMode, routeAfterSignIn } from '@/lib/onboarding';
import { useDebug } from '@/lib/server';

/**
 * How to sign in, after 'Create an account' (mode=new, onboarding step 1) or 'I already have an account'
 * (mode=login): Apple (iOS), Google and e-mail, the same three either way. Which one you came for only changes the
 * words, and what we say afterwards when the account isn't what you asked for (lib/onboarding.routeAfterSignIn).
 */
export default function LoginChoice() {
  const debug = useDebug();
  const { t } = useT();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: AuthMode = params.mode === 'login' ? 'login' : 'new';
  const [apple, setApple] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What exactly went wrong with Google, for debug builds (a wrong SHA-1 or client id says so here)
  const [detail, setDetail] = useState<string | null>(null);
  const google = googleSupport() === 'ready';

  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setApple).catch(() => {});
  }, []);

  async function signInWithApple() {
    setError(null);
    setDetail(null);
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
      await afterSignIn(tokens);
      routeAfterSignIn(tokens, { mode });
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      setError(e instanceof ApiError ? e.message : t('common.tryAgain'));
    }
  }

  return (
    <Screen back progress={mode === 'new' ? [1, 9] : undefined} noBanner>
      <View className="gap-2">
        <Text variant="title" accessibilityRole="header">
          {t(mode === 'new' ? 'auth.newTitle' : 'auth.loginTitle')}
        </Text>
        <Text tone="ink2">{t(mode === 'new' ? 'auth.newBody' : 'auth.loginBody')}</Text>
      </View>
      <View className="gap-2">
        {apple ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={mode === 'new' ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={{ height: 52 }}
            onPress={signInWithApple}
          />
        ) : null}
        <GoogleButton
          mode={mode}
          onError={(message, why) => {
            setError(message);
            setDetail(why ?? null);
          }}
        />
        <Button variant={apple || google ? 'secondary' : 'primary'} icon="mail" label={t('welcome.email')} onPress={() => router.push({ pathname: '/login/email', params: { mode } })} />
      </View>
      {error ? (
        <View className="gap-1">
          <Text variant="sm" tone="danger" className="text-center" accessibilityLiveRegion="polite">
            {error}
          </Text>
          {debug && detail ? (
            <Text variant="xs" tone="ink2" className="text-center" selectable>
              {detail}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View className="gap-2">
        <Text variant="sm" tone="ink2">
          {t(mode === 'new' ? 'auth.newNote' : 'auth.loginNote')}
        </Text>
        <Text bold tone="you" className="underline self-start py-1" accessibilityRole="link" onPress={() => router.setParams({ mode: mode === 'new' ? 'login' : 'new' })}>
          {t(mode === 'new' ? 'auth.toLogin' : 'auth.toNew')}
        </Text>
      </View>
    </Screen>
  );
}
