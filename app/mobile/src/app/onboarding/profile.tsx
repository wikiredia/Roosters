import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useMe, useUpdateMe } from '@/api/hooks';
import { ProfilePhoto } from '@/components/ProfilePhoto';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Inputs';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';

/** The name the server made up (from your e-mail address, or "Student"): not one to fill in for you. */
function madeUp(name: string, email: string | null | undefined) {
  return name === 'Student' || (!!email && name === email.split('@')[0]);
}

/**
 * Step 2: your first and last name and a photo, so friends recognise you (in chats, on Today). Skippable: then
 * the name from your e-mail address stays, and the coloured initial.
 */
export default function ProfileStep() {
  const { t } = useT();
  const me = useMe();
  const update = useUpdateMe();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');

  useEffect(() => {
    const u = me.data;
    if (!u || madeUp(u.display_name, u.email)) return;
    const [a, ...rest] = u.display_name.split(/\s+/);
    setFirst(a ?? '');
    setLast(rest.join(' '));
  }, [me.data?.id]);

  const name = [first.trim(), last.trim()].filter(Boolean).join(' ');

  async function next() {
    if (name && name !== me.data?.display_name) {
      try {
        await update.mutateAsync({ display_name: name });
      } catch {
        return;
      }
    }
    router.push('/onboarding/school');
  }

  return (
    <Screen
      back
      progress={[2, 7]}
      navRight={<Button variant="ghost" size="sm" label={t('common.skip')} onPress={() => router.push('/onboarding/school')} />}
      footer={<Button label={t('common.next')} loading={update.isPending} onPress={next} />}
    >
      <View className="gap-1">
        <Text variant="title" accessibilityRole="header">
          {t('profileStep.title')}
        </Text>
        <Text tone="ink2">{t('profileStep.body')}</Text>
      </View>
      <ProfilePhoto me={me.data} name={name || me.data?.display_name || ''} color={me.data?.avatar_color ?? 0} />
      <Input label={t('profileStep.first')} value={first} onChangeText={setFirst} maxLength={30} autoComplete="given-name" textContentType="givenName" autoCapitalize="words" returnKeyType="next" />
      <Input label={t('profileStep.last')} value={last} onChangeText={setLast} maxLength={30} autoComplete="family-name" textContentType="familyName" autoCapitalize="words" returnKeyType="done" onSubmitEditing={next} />
      {update.isError ? (
        <Text variant="sm" bold tone="danger">
          {update.error.message}
        </Text>
      ) : null}
    </Screen>
  );
}
