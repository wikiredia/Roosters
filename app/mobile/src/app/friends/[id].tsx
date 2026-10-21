import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useBlock, useFriends, useFriendSchedule, useRemoveFriend, useSetVisibility } from '@/api/hooks';
import { WeekView } from '@/components/timetable/WeekView';
import { Avatar, Option } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Card, Row, Section, SectionHead } from '@/components/ui/Layout';
import { Empty, Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { confirm } from '@/lib/confirm';
import { addDays, isoDay, monday, nowMin } from '@/lib/time';

/** One friend: their week, what they see of you, remove or block. */
export default function FriendScreen() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const fid = Number(id);
  const friends = useFriends();
  const f = friends.data?.find((x) => x.id === fid);
  const now = new Date();
  const week = monday([0, 6].includes(now.getDay()) ? addDays(now, 3) : now);
  const schedule = useFriendSchedule(fid, isoDay(week), 5);
  const vis = useSetVisibility();
  const remove = useRemoveFriend();
  const block = useBlock();

  if (friends.data && !f) {
    return (
      <Screen back>
        <Empty title={t('friend.gone')} />
      </Screen>
    );
  }
  const name = f?.display_name ?? '';
  const shown = vis.isPending ? vis.variables.visibility : f?.my_visibility;

  async function onRemove() {
    if (await confirm(t('friend.removeConfirm', { name }), t('friend.removeSub'), t('friend.remove'), t('common.cancel'))) {
      await remove.mutateAsync(fid);
      router.back();
    }
  }
  async function onBlock() {
    if (await confirm(t('friend.blockConfirm', { name }), t('friend.blockSub', { name }), t('friend.block', { name }), t('common.cancel'))) {
      await block.mutateAsync(fid);
      router.back();
    }
  }

  return (
    <Screen back>
      <View className="items-center gap-2">
        <Avatar name={name || '?'} color={f?.avatar_color ?? 1} size="xl" />
        <Text variant="title">{name}</Text>
      </View>
      <Button icon="swap" label={t('friend.compare')} onPress={() => router.push({ pathname: '/compare', params: { ids: String(fid) } })} />

      <Section>
        <SectionHead title={t('friend.theirWeek')} />
        {schedule.data?.hidden ? (
          <Card className="p-4">
            <Text tone="ink2">{t('status.hidden')}</Text>
          </Card>
        ) : schedule.data ? (
          <Card className="p-2.5">
            <WeekView monday={week} lessons={schedule.data.lessons} todayIso={isoDay(now)} nowMin={nowMin()} pxPerHour={32} />
          </Card>
        ) : (
          <Card className="p-4 h-40">
            <Skeleton width={160} />
          </Card>
        )}
        {schedule.data?.visibility === 'freebusy' ? (
          <Text variant="sm" tone="ink2">
            {t('friend.onlyFreeBusy', { name })}
          </Text>
        ) : null}
      </Section>

      <Section>
        <SectionHead title={t('friend.whatSees', { name })} />
        <View accessibilityRole="radiogroup" className="gap-2">
          <Option label={t('friend.full')} sub={t('friend.fullSub')} on={shown === 'full'} onPress={() => vis.mutate({ id: fid, visibility: 'full' })} />
          <Option label={t('friend.freebusy')} sub={t('friend.freebusySub', { name })} on={shown === 'freebusy'} onPress={() => vis.mutate({ id: fid, visibility: 'freebusy' })} />
        </View>
      </Section>

      <Card>
        <Row first title={t('friend.remove')} sub={t('friend.removeSub')} tone="danger" onPress={onRemove} />
        <Row title={t('friend.block', { name })} sub={t('friend.blockSub', { name })} tone="danger" onPress={onBlock} />
      </Card>
    </Screen>
  );
}
