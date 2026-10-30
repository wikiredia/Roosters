import { router } from 'expo-router';
import { View } from 'react-native';

import { useFriends, useMe, usePinFriend } from '@/api/hooks';
import type { Friend } from '@/api/types';
import { VerifyFirst } from '@/components/VerifyFirst';
import { Avatar } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, ListHead, Row } from '@/components/ui/Layout';
import { Empty, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { pinnedFirst } from '@/lib/friends';

/** All friends (the ones you pinned on top, in their own card; the thumbtack on each row pins or unpins). Tapping
 * one opens their profile. Friend requests are on top of the Chat tab. */
export default function FriendsScreen() {
  const { t } = useT();
  const friends = useFriends();
  const pin = usePinFriend();
  const list = pinnedFirst(friends.data ?? []);
  const pinned = list.filter((f) => f.pinned);
  const others = list.filter((f) => !f.pinned);
  const me = useMe();

  const row = (f: Friend, i: number) => (
    <Row
      key={f.id}
      first={i === 0}
      className="pr-1.5"
      left={<Avatar name={f.display_name} color={f.avatar_color} uid={f.id} photo={f.photo} />}
      title={f.display_name}
      sub={t(f.my_visibility === 'full' ? 'friends.seesFull' : f.my_visibility === 'norooms' ? 'friends.seesNoRooms' : 'friends.seesFreeBusy')}
      onPress={() => router.push(`/friends/${f.id}`)}
      right={
        <IconButton
          icon="thumbtack"
          solid={f.pinned}
          color={f.pinned ? 'you-ink' : 'ink-3'}
          label={t(f.pinned ? 'friend.unpinName' : 'friend.pinName', { name: f.display_name })}
          accessibilityState={{ selected: f.pinned }}
          onPress={() => pin.mutate({ id: f.id, pinned: !f.pinned })}
        />
      }
    />
  );
  if (me.data?.guest) return <VerifyFirst navTitle={t('me.friends')} />;

  return (
    <Screen
      back
      navTitle={t('me.friends')}
      onRefresh={() => friends.refetch()}
    >
      <Button icon="plus" label={t('me.addFriend')} onPress={() => router.push('/friends/add')} />

      {list.length === 0 && friends.data ? (
        <Empty title={t('friends.emptyTitle')} body={t('today.noFriendsBody')} mood="happy" />
      ) : (
        <>
          {pinned.length > 0 ? (
            <View>
              <ListHead>{t('friends.pinned')}</ListHead>
              <Card>{pinned.map(row)}</Card>
            </View>
          ) : null}
          {others.length > 0 ? (
            <View>
              <ListHead>{pinned.length ? t('friends.others', { n: others.length }) : t('friends.all', { n: list.length })}</ListHead>
              <Card>{others.map(row)}</Card>
            </View>
          ) : null}
        </>
      )}

      <Text variant="xs" tone="ink3" className="text-center">
        {t('friends.privacyNote')}
      </Text>
    </Screen>
  );
}
