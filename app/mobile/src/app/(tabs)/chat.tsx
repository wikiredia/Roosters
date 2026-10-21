import { router } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Empty, Screen } from '@/components/ui/Screen';
import { useT } from '@/i18n';

/** Chat comes with the next backend round (moderation, reporting, push per chat). */
export default function ChatScreen() {
  const { t } = useT();
  return (
    <Screen title={t('tabs.chat')}>
      <Empty
        title={t('chat.soonTitle')}
        body={t('chat.soonBody')}
        mood="sleepy"
        action={<Button variant="secondary" icon="users" label={t('chat.friends')} onPress={() => router.push('/friends')} className="mt-2" />}
      />
    </Screen>
  );
}
