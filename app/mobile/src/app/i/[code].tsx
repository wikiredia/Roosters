import { useQuery } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useAcceptInvite } from '@/api/hooks';
import { Avatar } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Empty, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { setPendingInvite } from '@/lib/invite';
import { session } from '@/lib/session';

type Preview = { inviter: { id: number; display_name: string; avatar_color: number }; already_friends: boolean };

/** roostersplus://i/<code>: someone sent you their link. */
export default function InviteScreen() {
  const { t } = useT();
  const { code } = useLocalSearchParams<{ code: string }>();
  const s = session.use();
  const signedIn = s.status === 'signedIn';
  const preview = useQuery({
    queryKey: ['invite-preview', code],
    queryFn: () => api.get<Preview>(`/api/v1/invites/${encodeURIComponent(code)}`),
    enabled: signedIn && !!code,
    retry: false,
  });
  const accept = useAcceptInvite();

  // Not signed in yet: remember the code, accept it after onboarding
  useEffect(() => {
    if (s.status === 'signedOut' && code) setPendingInvite(code);
  }, [s.status, code]);

  if (s.status === 'loading') return null;
  if (!signedIn) return <Redirect href="/welcome" />;

  const p = preview.data;
  return (
    <Screen back>
      {preview.isError ? (
        <Empty title={t('add.badCode')} body={t('invite.invalidBody')} mood="sleepy" action={<Button variant="secondary" label={t('common.back')} onPress={() => router.replace('/')} />} />
      ) : p ? (
        <View className="items-center gap-4 pt-8">
          <Avatar name={p.inviter.display_name} color={p.inviter.avatar_color} size="xl" />
          <Text variant="title" className="text-center">
            {p.already_friends ? t('invite.already', { name: p.inviter.display_name }) : t('invite.join', { name: p.inviter.display_name })}
          </Text>
          <Text tone="ink2" className="text-center">
            {t('invite.joinBody')}
          </Text>
          {p.already_friends ? (
            <Button label={t('common.next')} onPress={() => router.replace('/')} />
          ) : (
            <Button
              label={t('invite.accept')}
              loading={accept.isPending}
              onPress={() => accept.mutate(code, { onSuccess: () => router.replace(`/friends/${p.inviter.id}`) })}
            />
          )}
        </View>
      ) : (
        <Empty title={t('gate.loading')} />
      )}
    </Screen>
  );
}
