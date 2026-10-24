import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAcceptInvite, useClassmates, useFriendRequest, useMe } from '@/api/hooks';
import { VerifyFirst } from '@/components/VerifyFirst';
import { InviteCard } from '@/components/InviteCard';
import { QrCard, ScanCard } from '@/components/QrCard';
import { Avatar, Tag } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Inputs';
import { Card, Row, Section, SectionHead } from '@/components/ui/Layout';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';

/** Your link and code, your QR code, scanning a friend's, typing a friend's code, or classmates who are already on Roosters+. */
export default function AddFriendScreen() {
  const { t } = useT();
  const mates = useClassmates();
  const ask = useFriendRequest();
  const accept = useAcceptInvite();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const me = useMe();
  if (me.data?.guest) return <VerifyFirst navTitle={t('me.addFriend')} />;

  async function useCode() {
    setError(null);
    // Accept a whole link too: https://…/i/ABCD2345
    const c = code.trim().split('/').pop() ?? '';
    try {
      await accept.mutateAsync(c);
      router.replace('/friends');
    } catch (e) {
      setError(e instanceof ApiError ? t(e.code === 'invite_self' ? 'add.ownCode' : 'add.badCode') : t('common.offline'));
    }
  }

  return (
    <Screen back navTitle={t('me.addFriend')}>
      <InviteCard />
      <QrCard />
      <ScanCard />

      <Section>
        <SectionHead title={t('add.haveCode')} />
        <Input
          label={t('add.codeLabel')}
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          error={error ?? undefined}
          returnKeyType="done"
          onSubmitEditing={useCode}
        />
        <Button variant="secondary" label={t('add.useCode')} disabled={code.trim().length < 6} loading={accept.isPending} onPress={useCode} />
      </Section>

      {mates.data && mates.data.length > 0 ? (
        <Section>
          <SectionHead title={t('friendsStep.classmates')} aside={String(mates.data.length)} />
          <Card>
            {mates.data.map((m, i) => (
              <Row
                key={m.id}
                first={i === 0}
                title={m.display_name}
                sub={m.classes.join(', ')}
                left={<Avatar name={m.display_name} color={m.avatar_color} uid={m.id} photo={m.photo} />}
                right={
                  m.requested ? (
                    <Tag kind="ok" icon="check">
                      {t('friendsStep.asked')}
                    </Tag>
                  ) : (
                    <Button variant="secondary" size="sm" label={t('friendsStep.add')} loading={ask.isPending && ask.variables === m.id} onPress={() => ask.mutate(m.id)} />
                  )
                }
              />
            ))}
          </Card>
        </Section>
      ) : (
        <View className="gap-1">
          <Text bold>{t('friendsStep.classmates')}</Text>
          <Text variant="sm" tone="ink2">
            {t('add.noClassmates')}
          </Text>
        </View>
      )}
    </Screen>
  );
}
