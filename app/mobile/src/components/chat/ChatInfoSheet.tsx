import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAddToChat, useEditChat, useFriends, useLeaveChat } from '@/api/hooks';
import type { ChatDetail } from '@/api/types';
import { Avatar, Chip, Tag } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Input, Toggle } from '@/components/ui/Inputs';
import { Card, ListHead, Row } from '@/components/ui/Layout';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { confirm } from '@/lib/confirm';

/**
 * About a chat: pin it (only for you), who's in it; a group: rename it, add friends of yours, leave it. A one-to-one
 * chat leads to the friend's page (their week, what they see of you, block).
 */
export function ChatInfoSheet({ visible, chat, onClose }: { visible: boolean; chat: ChatDetail; onClose: () => void }) {
  const { t } = useT();
  const edit = useEditChat(chat.id);
  const add = useAddToChat(chat.id);
  const leave = useLeaveChat(chat.id);
  const friends = useFriends();
  const [name, setName] = useState(chat.name ?? '');
  const [adding, setAdding] = useState<number[]>([]);
  const group = chat.kind === 'group';
  const inIt = new Set(chat.people.map((p) => p.id));
  const addable = (friends.data ?? []).filter((f) => !inIt.has(f.id));
  const error = edit.error ?? add.error ?? leave.error;

  async function onLeave() {
    if (!(await confirm(t('chat.leaveConfirm', { name: chat.name ?? '' }), t('chat.leaveSub'), t('chat.leave'), t('common.cancel')))) return;
    await leave.mutateAsync();
    onClose();
    router.back();
  }

  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t('common.close')} title={chat.name ?? ''} sub={group ? t('chat.members', { n: chat.count }) : undefined}>
      <Card>
        <Row first title={t('chat.pin')} sub={t('chat.pinSub')} right={<Toggle value={chat.pinned} onChange={(v) => edit.mutate({ pinned: v })} label={t('chat.pin')} />} />
      </Card>
      {group ? (
        <View className="flex-row items-end gap-2">
          <Input label={t('chat.groupName')} value={name} onChangeText={setName} maxLength={40} className="flex-1" />
          <Button
            variant="secondary"
            size="sm"
            label={t('common.save')}
            className="mb-1"
            disabled={!name.trim() || name.trim() === chat.name || edit.isPending}
            onPress={() => edit.mutate({ name: name.trim() })}
          />
        </View>
      ) : null}
      <View>
        <ListHead>{t('chat.people')}</ListHead>
        <Card>
          {chat.people.map((p, i) => (
            <Row
              key={p.id}
              first={i === 0}
              left={<Avatar name={p.display_name} color={p.avatar_color} uid={p.id} photo={p.photo} size="sm" />}
              title={p.me ? `${p.display_name} (${t('chat.you').toLowerCase()})` : p.display_name}
              right={!p.me && !p.friend ? <Tag>{t('chat.notFriend')}</Tag> : undefined}
              chevron={!p.me && p.friend}
              onPress={
                !p.me && p.friend
                  ? () => {
                      onClose();
                      router.push(`/friends/${p.id}`);
                    }
                  : undefined
              }
            />
          ))}
        </Card>
      </View>
      {group && addable.length ? (
        <View className="gap-2">
          <Text variant="sm" bold>
            {t('chat.addPeople')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {addable.map((f) => (
              <Chip
                key={f.id}
                label={f.display_name}
                state={adding.includes(f.id) ? 'on' : 'default'}
                icon={adding.includes(f.id) ? 'check' : 'plus'}
                onPress={() => setAdding(adding.includes(f.id) ? adding.filter((x) => x !== f.id) : [...adding, f.id])}
              />
            ))}
          </View>
          {adding.length ? (
            <Button
              size="sm"
              icon="plus"
              label={t('chat.addN', { n: adding.length })}
              className="self-start"
              loading={add.isPending}
              onPress={() => add.mutate(adding, { onSuccess: () => setAdding([]) })}
            />
          ) : null}
        </View>
      ) : null}
      {error ? (
        <Text variant="sm" bold tone="danger">
          {error.message}
        </Text>
      ) : null}
      {group ? <Button variant="ghost" icon="logout" label={t('chat.leave')} onPress={onLeave} /> : null}
    </Sheet>
  );
}
