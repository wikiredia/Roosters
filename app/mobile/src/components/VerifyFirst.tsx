import { router } from 'expo-router';
import { View } from 'react-native';

import { useT } from '@/i18n';

import { Button } from './ui/Button';
import { Empty, Screen } from './ui/Screen';

/** Friends screens for a guest: friends need a confirmed e-mail address (nobody can pose as someone else). */
export function VerifyFirst({ navTitle }: { navTitle?: string }) {
  const { t } = useT();
  return (
    <Screen back navTitle={navTitle}>
      <Empty
        title={t('steps.verifyTitle')}
        body={t('steps.verifyBody')}
        mood="happy"
        action={
          <View className="self-stretch pt-2">
            <Button icon="mail" label={t('steps.email')} onPress={() => router.push({ pathname: '/login/email', params: { from: 'steps' } })} />
          </View>
        }
      />
    </Screen>
  );
}
