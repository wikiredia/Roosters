import { View } from 'react-native';

import { useClassmates, useFriendRequest } from '@/api/hooks';
import { InviteCard } from '@/components/InviteCard';
import { Avatar, Tag } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Card, Row, Section, SectionHead } from '@/components/ui/Layout';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { useFinishOnboarding } from '@/lib/onboarding';

/** Step 6: send your link, or add classmates who are already on Roosters+. Skipping is fine. */
export default function FriendsStep() {
  const { t } = useT();
  const mates = useClassmates();
  const ask = useFriendRequest();
  const { finish, busy } = useFinishOnboarding();

  return (
    <Screen
      back
      progress={[6, 6]}
      navRight={<Button variant="ghost" size="sm" label={t('common.skip')} onPress={finish} />}
      footer={<Button label={t('common.next')} loading={busy} onPress={finish} />}
    >
      <View className="gap-2">
        <Text variant="title" accessibilityRole="header">
          {t('friendsStep.title')}
        </Text>
        <Text tone="ink2">{t('friendsStep.body')}</Text>
      </View>
      <InviteCard />
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
                left={<Avatar name={m.display_name} color={m.avatar_color} />}
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
      ) : null}
    </Screen>
  );
}
