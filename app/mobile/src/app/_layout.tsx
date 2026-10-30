import '../global.css';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { PerfOverlay } from '@/components/PerfOverlay';
import { loadLanguage } from '@/i18n';
import { fonts } from '@/lib/fonts';
import { loadLabs } from '@/lib/labs';
import { startNetworkWatch } from '@/lib/net';
import { persister, queryClient, shouldPersist, startFocusWatch } from '@/lib/query';
import { loadServer } from '@/lib/server';
import { resetTo } from '@/lib/nav';
import { loadSession, session } from '@/lib/session';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fonts);
  const [ready, setReady] = useState(false);
  const bg = useCSSVariable('--color-bg');

  useEffect(() => {
    startNetworkWatch();
    startFocusWatch();
    Promise.all([loadServer(), loadSession(), loadLanguage(), loadLabs()]).finally(() => setReady(true));
    // Signing out: forget everything that was cached for that account. Ended by the server (wherever you
    // are: onboarding, a sheet, settings): back to welcome, which says why, instead of errors on every screen
    let was = session.get().status;
    return session.subscribe(() => {
      const s = session.get();
      if (s.status === 'signedOut') queryClient.clear();
      if (s.status === 'signedOut' && s.ended && was === 'signedIn') resetTo('/welcome');
      was = s.status;
    });
  }, []);

  const show = (fontsLoaded || !!fontError) && ready;
  useEffect(() => {
    if (show) SplashScreen.hideAsync().catch(() => {});
  }, [show]);

  if (!show) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        // Bump `buster` when cached shapes change, so old caches are thrown away
        // Only what the next cold start needs is written (lib/query.shouldPersist)
        persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60_000, buster: 'v2-2', dehydrateOptions: { shouldDehydrateQuery: shouldPersist } }}
      >
        <StatusBar style="auto" />
        {/* The same native push on iOS and Android, with the swipe back */}
        <Stack screenOptions={{ headerShown: false, animation: 'ios_from_right', contentStyle: { backgroundColor: String(bg ?? '#F4F3EF') } }}>
          {/* The app itself: nothing to swipe back to (welcome and onboarding are gone, see lib/nav.resetTo) */}
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="index" options={{ gestureEnabled: false, animation: 'none' }} />
          {/* After signing in (lib/nav.resetTo): nothing to swipe back to either */}
          <Stack.Screen name="login/found" options={{ gestureEnabled: false, animation: 'fade' }} />
        </Stack>
        {/* Debug builds and the owner's account only (lib/server useDebug), and only when switched on (Server & debug) */}
        <PerfOverlay />
      </PersistQueryClientProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
