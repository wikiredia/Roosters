import { router } from 'expo-router';
import { View } from 'react-native';

import { useAnswerRequest, useFriends, useMe, usePinFriend, useRequests } from '@/api/hooks';
import type { Friend } from '@/api/types';
import { VerifyFirst } from '@/components/VerifyFirst';
import { Avatar } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, ListHead, Row } from '@/components/ui/Layout';
import { Empty, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { pinnedFirst } from '@/lib/friends';

/** All friends (the ones you pinned on top, in their own card; the thumbtack on each row pins or unpins), plus
 * requests waiting for an answer. */
export default function FriendsScreen() {
  const { t } = useT();
  const friends = useFriends();
  const requests = useRequests();
  const answer = useAnswerRequest();
  const pin = usePinFriend();
  const incoming = requests.data?.incoming ?? [];
  const outgoing = requests.data?.outgoing ?? [];
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
      onRefresh={() => Promise.all([friends.refetch(), requests.refetch()])}
    >
      <Button icon="plus" label={t('me.addFriend')} onPress={() => router.push('/friends/add')} />

      {incoming.length > 0 ? (
        <View>
          <ListHead>{t('friends.incoming')}</ListHead>
          <Card>
            {incoming.map((r, i) => (
              <Row
                key={r.id}
                first={i === 0}
                left={<Avatar name={r.user.display_name} color={r.user.avatar_color} uid={r.user.id} photo={r.user.photo} />}
                title={r.user.display_name}
                sub={t('friends.wantsToBeFriends')}
              >
                <View className="flex-row gap-2 pt-2">
                  <Button size="sm" label={t('friends.accept')} loading={answer.isPending && answer.variables?.id === r.id && answer.variables.action === 'accept'} onPress={() => answer.mutate({ id: r.id, action: 'accept' })} />
                  <Button size="sm" variant="secondary" label={t('friends.decline')} onPress={() => answer.mutate({ id: r.id, action: 'decline' })} />
                </View>
              </Row>
            ))}
          </Card>
        </View>
      ) : null}

      {list.length === 0 && incoming.length === 0 && friends.data ? (
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

      {outgoing.length > 0 ? (
        <View>
          <ListHead>{t('friends.outgoing')}</ListHead>
          <Card>
            {outgoing.map((r, i) => (
              <Row
                key={r.id}
                first={i === 0}
                left={<Avatar name={r.user.display_name} color={r.user.avatar_color} uid={r.user.id} photo={r.user.photo} />}
                title={r.user.display_name}
                sub={t('friends.waiting')}
                right={<Button size="sm" variant="ghost" label={t('friends.cancel')} onPress={() => answer.mutate({ id: r.id, action: 'cancel' })} />}
              />
            ))}
          </Card>
        </View>
      ) : null}
      <Text variant="xs" tone="ink3" className="text-center">
        {t('friends.privacyNote')}
      </Text>
    </Screen>
  );
}
