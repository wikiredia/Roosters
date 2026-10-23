import '../global.css';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { loadLanguage } from '@/i18n';
import { fonts } from '@/lib/fonts';
import { startNetworkWatch } from '@/lib/net';
import { persister, queryClient, startFocusWatch } from '@/lib/query';
import { loadServer } from '@/lib/server';
import { loadSession, session } from '@/lib/session';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fonts);
  const [ready, setReady] = useState(false);
  const bg = useCSSVariable('--color-bg');

  useEffect(() => {
    startNetworkWatch();
    startFocusWatch();
    Promise.all([loadServer(), loadSession(), loadLanguage()]).finally(() => setReady(true));
    // Signing out: forget everything that was cached for that account
    return session.subscribe(() => {
      if (session.get().status === 'signedOut') queryClient.clear();
    });
  }, []);

  const show = (fontsLoaded || !!fontError) && ready;
  useEffect(() => {
    if (show) SplashScreen.hideAsync().catch(() => {});
  }, [show]);

  if (!show) return null;
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        // Bump `buster` when cached shapes change, so old caches are thrown away
        persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60_000, buster: 'v2-1' }}
      >
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: String(bg ?? '#F4F3EF') } }} />
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
