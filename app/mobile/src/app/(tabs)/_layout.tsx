import { Redirect } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { useEffect } from 'react';

import { useAcceptInvite } from '@/api/hooks';
import { BottomTabs } from '@/components/BottomTabs';
import { takePendingInvite } from '@/lib/invite';
import { handlePushResponses, registerPush } from '@/lib/push';
import { session } from '@/lib/session';

function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const active = state.routes[state.index]?.name;
  return (
    <BottomTabs
      active={active}
      onSelect={(name) => {
        const route = state.routes.find((r) => r.name === name);
        if (!route) return;
        const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (active !== name && !e.defaultPrevented) navigateToTab(route.key);
      }}
    />
  );
}

export default function TabsLayout() {
  const s = session.use();
  const accept = useAcceptInvite();

  useEffect(() => {
    // An invite opened before signing in: accept it now
    if (s.status === 'signedIn') takePendingInvite().then((code) => code && accept.mutate(code));
    // This session's push token (only if notifications are already allowed: asking is for Meldingen)
    if (s.status === 'signedIn') registerPush();
  }, [s.status]);

  // A push opened the app (or was tapped while it ran): go to what it's about. Here, not in the root layout:
  // the tabs only show once you're signed in and set up, so the screen it opens lands on top of them.
  useEffect(() => handlePushResponses(), []);

  if (s.status === 'signedOut') return <Redirect href="/welcome" />;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Tabs.Screen name="rooster" />
      <Tabs.Screen name="today" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="ik" />
    </Tabs>
  );
}
