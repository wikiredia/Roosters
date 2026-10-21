import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useDeleteAccount } from '@/api/hooks';
import { Mascot } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/ui/Layout';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT, type Key } from '@/i18n';

const WHAT: Key[] = ['delete.profile', 'delete.friends', 'delete.sources', 'delete.history'];

/** Account verwijderen: calm, clear, no tricks. Deleting happens right away on the server. */
export default function DeleteScreen() {
  const { t } = useT();
  const del = useDeleteAccount();
  const [failed, setFailed] = useState(false);

  return (
    <Screen
      back
      footer={
        <>
          <Button
            variant="danger"
            label={t('delete.confirm')}
            loading={del.isPending}
            onPress={() => {
              setFailed(false);
              del.mutate(undefined, { onError: () => setFailed(true) });
            }}
          />
          <Button variant="ghost" label={t('delete.cancel')} onPress={() => router.back()} />
        </>
      }
    >
      <View className="items-center pt-2">
        <Mascot size={80} mood="sleepy" />
      </View>
      <Text variant="title" accessibilityRole="header">
        {t('delete.title')}
      </Text>
      <Card className="p-4 gap-3">
        <Text bold>{t('delete.whatHead')}</Text>
        {WHAT.map((k) => (
          <View key={k} className="flex-row items-center gap-2.5">
            <Icon name="check" size={18} color="ink-2" strokeWidth={2.5} />
            <Text className="flex-1">{t(k)}</Text>
          </View>
        ))}
      </Card>
      <Text tone="ink2">{t('delete.now')}</Text>
      <Text bold tone="you" accessibilityRole="link" onPress={() => router.back()}>
        {t('delete.downloadFirst')}
      </Text>
      {failed ? <Text tone="danger">{t('common.offline')}</Text> : null}
    </Screen>
  );
}
