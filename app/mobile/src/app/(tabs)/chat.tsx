import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAnswerRequest, useChats, useFriends, useMe, useOpenDirect, useRequests } from '@/api/hooks';
import type { Chat, Friend, PersonCard } from '@/api/types';
import { Avatar, AvatarStack, Badge, Banner, Tag } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Card, ListHead, Row } from '@/components/ui/Layout';
import { Reveal } from '@/components/ui/Motion';
import { Empty, Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { preview, when } from '@/lib/chat';

/**
 * Chat: friend requests on top ("Verzoeken", folded by default), then pinned chats, your groups, and your friends
 * (one-to-one; a friend you haven't written yet is there too, so starting a chat is one tap). Unread ones are bold
 * with a count; a chat with an open break or access request has a yellow "Verzoek" tag. "+" makes a group.
 */
export default function ChatScreen() {
  const { t } = useT();
  const me = useMe();
  const chats = useChats();
  const friends = useFriends();
  const open = useOpenDirect();

  if (me.data?.guest) {
    return (
      <Screen title={t('tabs.chat')}>
        <Empty
          title={t('steps.verifyTitle')}
          body={t('chat.verifyBody')}
          mood="happy"
          action={<Button icon="mail" label={t('steps.email')} onPress={() => router.push({ pathname: '/login/email', params: { from: 'steps' } })} className="mt-2" />}
        />
      </Screen>
    );
  }

  const list = chats.data?.chats ?? [];
  const pinned = list.filter((c) => c.pinned);
  const groups = list.filter((c) => !c.pinned && c.kind === 'group');
  const direct = list.filter((c) => !c.pinned && c.kind === 'direct');
  const withChat = new Set(list.filter((c) => c.kind === 'direct').map((c) => c.with_id));
  const rest = (friends.data ?? []).filter((f) => !withChat.has(f.id));
  const loading = chats.isLoading || friends.isLoading;
  const nobody = !loading && list.length === 0 && (friends.data ?? []).length === 0;

  async function start(f: Friend) {
    const c = await open.mutateAsync(f.id);
    router.push(`/chat/${c.id}`);
  }

  return (
    <Screen
      title={t('tabs.chat')}
      right={!nobody ? <IconButton icon="plus" label={t('chat.newGroup')} filled onPress={() => router.push('/chat/new')} /> : null}
      onRefresh={() => Promise.all([chats.refetch(), friends.refetch()])}
    >
      {chats.error && !chats.data ? <Banner kind="bad" title={t('chat.loadError')} body={t('common.tryAgain')} /> : null}
      <FriendRequests />
      {loading ? (
        <Card className="p-4 gap-3">
          <Skeleton width={180} />
          <Skeleton width={120} />
        </Card>
      ) : nobody ? (
        <Empty
          title={t('chat.noFriendsTitle')}
          body={t('chat.noFriendsBody')}
          mood="sleepy"
          action={<Button variant="secondary" icon="users" label={t('me.addFriend')} onPress={() => router.push('/friends/add')} className="mt-2" />}
        />
      ) : (
        <Reveal className="gap-6">
          <ChatList head={t('chat.pinned')} chats={pinned} me={me.data?.id} />
          <ChatList head={t('chat.groups')} chats={groups} me={me.data?.id} />
          {direct.length || rest.length ? (
            <View>
              <ListHead>{t('chat.friends')}</ListHead>
              <Card>
                {direct.map((c, i) => (
                  <ChatRow key={c.id} chat={c} first={i === 0} me={me.data?.id} />
                ))}
                {rest.map((f, i) => (
                  <Row
                    key={`f${f.id}`}
                    first={direct.length === 0 && i === 0}
                    left={<Avatar name={f.display_name} color={f.avatar_color} uid={f.id} photo={f.photo} />}
                    title={f.display_name}
                    sub={t('chat.sayHi')}
                    accessibilityHint={t('chat.startHint')}
                    disabled={open.isPending}
                    onPress={() => start(f)}
                  />
                ))}
              </Card>
            </View>
          ) : null}
          {open.error ? (
            <Text variant="sm" bold tone="danger">
              {open.error.message}
            </Text>
          ) : null}
        </Reveal>
      )}
    </Screen>
  );
}

/**
 * "Verzoeken": friend requests, pinned on top and folded (the header shows how many came in). Open: who asked you
 * (✓ accept, ✗ decline) and who you asked (✗ take it back, "wacht op antwoord"). Accepting opens the chat with them:
 * a chat only exists between friends. Nothing when there are none.
 */
function FriendRequests() {
  const { t } = useT();
  const requests = useRequests();
  const answer = useAnswerRequest();
  const open = useOpenDirect();
  const [shown, setShown] = useState(false);
  const incoming = requests.data?.incoming ?? [];
  const outgoing = requests.data?.outgoing ?? [];
  if (!incoming.length && !outgoing.length) return null;
  const busy = (id: number) => (answer.isPending && answer.variables?.id === id) || open.isPending;

  async function accept(id: number, user: PersonCard) {
    try {
      await answer.mutateAsync({ id, action: 'accept' });
      const c = await open.mutateAsync(user.id);
      router.push(`/chat/${c.id}`);
    } catch {
      // Said under the list (answer.error / open.error)
    }
  }

  const person = (u: PersonCard) => <Avatar name={u.display_name} color={u.avatar_color} uid={u.id} photo={u.photo} />;
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: shown }}
        accessibilityLabel={[t('friends.incoming'), incoming.length ? t('friends.newN', { n: incoming.length }) : null].filter(Boolean).join(', ')}
        onPress={() => setShown((x) => !x)}
        className="flex-row items-center gap-3 px-4 min-h-14 active:bg-surface-sunken"
      >
        <Icon name="users" size={22} color="ink" />
        <Text bold className="flex-1">
          {t('friends.incoming')}
        </Text>
        {incoming.length ? <Badge n={incoming.length} /> : null}
        <View style={{ transform: [{ rotate: shown ? '180deg' : '0deg' }] }}>
          <Icon name="down" size={20} color="ink-3" />
        </View>
      </Pressable>
      {shown ? (
        <>
          {incoming.map((r) => (
            <Row
              key={`i${r.id}`}
              className="pr-1.5"
              left={person(r.user)}
              title={r.user.display_name}
              sub={t('friends.wantsToBeFriends')}
              right={
                <View className="flex-row">
                  <IconButton icon="check" color="you-ink" label={t('friends.acceptName', { name: r.user.display_name })} disabled={busy(r.id)} onPress={() => accept(r.id, r.user)} />
                  <IconButton icon="close" color="ink-2" label={t('friends.declineName', { name: r.user.display_name })} disabled={busy(r.id)} onPress={() => answer.mutate({ id: r.id, action: 'decline' })} />
                </View>
              }
            />
          ))}
          {outgoing.map((r) => (
            <Row
              key={`o${r.id}`}
              className="pr-1.5"
              left={person(r.user)}
              title={r.user.display_name}
              sub={t('friends.waiting')}
              right={<IconButton icon="close" color="ink-2" label={t('friends.cancelName', { name: r.user.display_name })} disabled={busy(r.id)} onPress={() => answer.mutate({ id: r.id, action: 'cancel' })} />}
            />
          ))}
          {answer.error || open.error ? (
            <Text variant="sm" bold tone="danger" className="px-4 pb-3">
              {(answer.error ?? open.error)?.message}
            </Text>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function ChatList({ head, chats, me }: { head: string; chats: Chat[]; me: number | undefined }) {
  if (!chats.length) return null;
  return (
    <View>
      <ListHead>{head}</ListHead>
      <Card>
        {chats.map((c, i) => (
          <ChatRow key={c.id} chat={c} first={i === 0} me={me} />
        ))}
      </Card>
    </View>
  );
}

function ChatRow({ chat, first, me }: { chat: Chat; first: boolean; me: number | undefined }) {
  const { t, lang } = useT();
  const unread = chat.unread > 0;
  const name = chat.name ?? t('chat.someone');
  const line = preview(chat, me, t);
  return (
    <Row
      first={first}
      left={
        chat.kind === 'direct' ? (
          <Avatar name={name} color={chat.avatar_color} uid={chat.with_id ?? undefined} photo={chat.photo} />
        ) : (
          <AvatarStack people={chat.members.slice(0, 3).map((p) => ({ name: p.display_name, color: p.avatar_color, uid: p.id, photo: p.photo }))} size="sm" />
        )
      }
      title={name}
      accessibilityLabel={[name, unread ? t('chat.unreadLabel', { n: chat.unread }) : null, chat.requests > 0 ? t('chat.requestTag') : null, line].filter(Boolean).join(', ')}
      onPress={() => router.push(`/chat/${chat.id}`)}
      sub={
        <Text variant="sm" tone={unread ? 'ink' : 'ink2'} bold={unread} numberOfLines={1}>
          {line}
        </Text>
      }
      right={
        <View className="items-end gap-1">
          <View className="flex-row items-center gap-1.5">
            {/* An open break or access request in it: small and yellow in the corner */}
            {chat.requests > 0 ? <Tag kind="together">{t('chat.requestTag')}</Tag> : null}
            {chat.last ? (
              <Text variant="xs" tone={unread ? 'ink' : 'ink3'} bold={unread}>
                {when(chat.last.created_at, t, lang)}
              </Text>
            ) : null}
          </View>
          <View className="flex-row items-center gap-1">
            {chat.push ? (
              <View accessible accessibilityLabel={t('chat.bellOn')}>
                <Icon name="bell" size={16} color="ink-3" />
              </View>
            ) : null}
            {unread ? <Badge n={chat.unread} /> : <View className="h-[18px]" />}
          </View>
        </View>
      }
    />
  );
}
