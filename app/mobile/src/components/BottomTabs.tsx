import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChats, useRequests } from '@/api/hooks';
import { Badge } from '@/components/ui/Bits';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useT, type Key } from '@/i18n';
import { cn } from '@/lib/cn';

/** The tabs, in order: Rooster first (where the app opens). */
export const TABS: Record<string, { icon: IconName; label: Key }> = {
  rooster: { icon: 'calendar', label: 'tabs.rooster' },
  today: { icon: 'sun', label: 'tabs.today' },
  chat: { icon: 'chat', label: 'tabs.chat' },
  ik: { icon: 'user', label: 'tabs.me' },
};

/** The bar itself: the tab layout renders it, and so does a pushed screen that keeps the bar visible (Vergelijken).
 * Chat's badge: unread messages plus friend requests you got (they're on top of the Chat tab). */
export function BottomTabs({ active, onSelect }: { active?: string; onSelect: (name: string) => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const unread = (useChats().data?.unread ?? 0) + (useRequests().data?.incoming.length ?? 0);
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row border-t border-line bg-surface px-2 pt-1.5"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      {Object.entries(TABS).map(([name, tab]) => {
        const on = active === name;
        const badge = name === 'chat' ? unread : 0;
        return (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={badge ? `${t(tab.label)}, ${t('chat.unreadLabel', { n: badge })}` : t(tab.label)}
            onPress={() => onSelect(name)}
            className="flex-1 items-center justify-center gap-0.5 min-h-[52px]"
          >
            <View className={cn('w-14 h-[30px] rounded-full items-center justify-center', on && 'bg-you-soft')}>
              <Icon name={tab.icon} size={24} color={on ? 'you-ink' : 'ink-3'} />
              {badge ? <Badge n={badge} className="absolute -top-0.5 right-2" /> : null}
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
