import { Redirect } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAcceptInvite } from '@/api/hooks';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useT, type Key } from '@/i18n';
import { cn } from '@/lib/cn';
import { takePendingInvite } from '@/lib/invite';
import { session } from '@/lib/session';

const TABS: Record<string, { icon: IconName; label: Key }> = {
  today: { icon: 'sun', label: 'tabs.today' },
  rooster: { icon: 'calendar', label: 'tabs.rooster' },
  chat: { icon: 'chat', label: 'tabs.chat' },
  ik: { icon: 'user', label: 'tabs.me' },
};

function TabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row border-t border-line bg-surface px-2 pt-1.5"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      {state.routes.map((route, i) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const on = state.index === i;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(tab.label)}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!on && !e.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
            className="flex-1 items-center justify-center gap-0.5 min-h-[52px]"
          >
            <View className={cn('w-14 h-[30px] rounded-full items-center justify-center', on && 'bg-you-soft')}>
              <Icon name={tab.icon} size={24} color={on ? 'you-ink' : 'ink-3'} />
            </View>
            <Text variant="xs" bold tone={on ? 'ink' : 'ink3'} style={{ lineHeight: 16 }}>
              {t(tab.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const s = session.use();
  const accept = useAcceptInvite();

  useEffect(() => {
    // An invite opened before signing in: accept it now
    if (s.status === 'signedIn') takePendingInvite().then((code) => code && accept.mutate(code));
  }, [s.status]);

  if (s.status === 'signedOut') return <Redirect href="/welcome" />;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="today" />
      <Tabs.Screen name="rooster" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="ik" />
    </Tabs>
  );
}
