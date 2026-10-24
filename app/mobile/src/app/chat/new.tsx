import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useFriends, useMe, useNewGroup } from '@/api/hooks';
import { VerifyFirst } from '@/components/VerifyFirst';
import { Avatar, Option } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Inputs';
import { ListHead } from '@/components/ui/Layout';
import { Empty, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';

/** A new group: a name and who's in it (your friends; anyone in it can add their own friends later). */
export default function NewGroupScreen() {
  const { t } = useT();
  const me = useMe();
  const friends = useFriends();
  const create = useNewGroup();
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<number[]>([]);

  if (me.data?.guest) return <VerifyFirst navTitle={t('chat.newGroup')} />;
  const list = friends.data ?? [];

  async function go() {
    const c = await create.mutateAsync({ name: name.trim(), user_ids: chosen });
    router.replace(`/chat/${c.id}`);
  }

  return (
    <Screen
      back
      navTitle={t('chat.newGroup')}
      footer={
        list.length ? (
          <Button icon="chat" label={t('chat.makeGroup')} disabled={!name.trim() || !chosen.length || create.isPending} loading={create.isPending} onPress={go} />
        ) : undefined
      }
    >
      {friends.isSuccess && !list.length ? (
        <Empty title={t('chat.noFriendsTitle')} body={t('chat.noFriendsBody')} mood="sleepy" />
      ) : (
        <>
          <Input label={t('chat.groupName')} placeholder={t('chat.groupNameHint')} value={name} onChangeText={setName} maxLength={40} autoFocus />
          <View className="gap-2">
            <ListHead>{t('chat.whoIn', { n: chosen.length })}</ListHead>
            {list.map((f) => (
              <View key={f.id} className="flex-row items-center gap-3">
                <Avatar name={f.display_name} color={f.avatar_color} uid={f.id} photo={f.photo} size="sm" />
                <View className="flex-1">
                  <Option
                    multi
                    label={f.display_name}
                    on={chosen.includes(f.id)}
                    onPress={() => setChosen(chosen.includes(f.id) ? chosen.filter((x) => x !== f.id) : [...chosen, f.id])}
                  />
                </View>
              </View>
            ))}
          </View>
          {create.error ? (
            <Text variant="sm" bold tone="danger">
              {create.error.message}
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}
