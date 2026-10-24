import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBlock, useFriends, useFriendSchedule, useOpenDirect, usePinFriend, useRemoveFriend, useSetVisibility } from '@/api/hooks';
import { END_HOUR, START_HOUR } from '@/components/timetable/Timetable';
import { WeekView } from '@/components/timetable/WeekView';
import { Avatar, Option } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Inputs';
import { Card, Row, Section, SectionHead } from '@/components/ui/Layout';
import { Empty, Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { confirm } from '@/lib/confirm';
import { addDays, isoDay, monday, nowMin } from '@/lib/time';

/** Room under the week card's grid: the day labels, the card's padding, the grid's own bottom margin. */
const WEEK_CHROME = 30 + 20 + 10;

/** One friend: chat with them, their week, what they see of you, pin them (only for you), remove or block. The week is sized so it
 * ends at the bottom of the screen: the first view is the whole profile with their whole week. */
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
  const pin = usePinFriend();
  const remove = useRemoveFriend();
  const block = useBlock();
  const open = useOpenDirect();
  const insets = useSafeAreaInsets();
  const screenH = useWindowDimensions().height;
  // Where the week starts on screen (before you scroll); the hours fill what's left of it below
  const weekRef = useRef<View>(null);
  const [weekTop, setWeekTop] = useState<number | null>(null);
  const room = weekTop == null ? 0 : screenH - Math.max(insets.bottom, 8) - weekTop - WEEK_CHROME;
  const pxPerHour = weekTop == null ? 32 : Math.max(24, Math.min(56, room / (END_HOUR - START_HOUR)));

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
    <Screen back contentClassName="gap-5 -mt-3">
      <View className="items-center gap-1.5">
        <Avatar name={name || '?'} color={f?.avatar_color ?? 1} uid={f?.id} photo={f?.photo} size="xl" />
        <Text variant="title">{name}</Text>
      </View>
      <View className="gap-2">
        <Button icon="swap" label={t('friend.compare')} onPress={() => router.push({ pathname: '/compare', params: { ids: String(fid) } })} />
        <Button
          variant="secondary"
          icon="chat"
          label={t('friend.chat', { name })}
          loading={open.isPending}
          onPress={async () => router.push(`/chat/${(await open.mutateAsync(fid)).id}`)}
        />
      </View>

      <Section>
        <SectionHead title={t('friend.theirWeek')} />
        <View ref={weekRef} onLayout={() => weekRef.current?.measureInWindow((_x, y) => weekTop == null && setWeekTop(y))} />
        {schedule.data?.hidden ? (
          <Card className="p-4">
            <Text tone="ink2">{t('status.hidden')}</Text>
          </Card>
        ) : schedule.data ? (
          <Card className="p-2.5">
            <WeekView monday={week} lessons={schedule.data.lessons} todayIso={isoDay(now)} nowMin={nowMin()} pxPerHour={pxPerHour} />
          </Card>
        ) : (
          <Card className="p-4 h-40">
            <Skeleton width={160} />
          </Card>
        )}
        {schedule.data?.visibility === 'freebusy' || schedule.data?.visibility === 'norooms' ? (
          <Text variant="sm" tone="ink2">
            {t(schedule.data.visibility === 'freebusy' ? 'friend.onlyFreeBusy' : 'friend.noRooms', { name })}
          </Text>
        ) : null}
      </Section>

      <Section>
        <SectionHead title={t('friend.whatSees', { name })} />
        <View accessibilityRole="radiogroup" className="gap-2">
          <Option label={t('friend.full')} sub={t('friend.fullSub')} on={shown === 'full'} onPress={() => vis.mutate({ id: fid, visibility: 'full' })} />
          <Option label={t('friend.norooms')} sub={t('friend.noroomsSub', { name })} on={shown === 'norooms'} onPress={() => vis.mutate({ id: fid, visibility: 'norooms' })} />
          <Option label={t('friend.freebusy')} sub={t('friend.freebusySub', { name })} on={shown === 'freebusy'} onPress={() => vis.mutate({ id: fid, visibility: 'freebusy' })} />
        </View>
      </Section>

      <Card>
        <Row
          first
          title={t('friend.pin')}
          sub={t('friend.pinSub', { name })}
          right={<Toggle value={!!f?.pinned} onChange={(v) => pin.mutate({ id: fid, pinned: v })} label={t('friend.pin')} />}
        />
        <Row title={t('friend.remove')} sub={t('friend.removeSub')} tone="danger" onPress={onRemove} />
        <Row title={t('friend.block', { name })} sub={t('friend.blockSub', { name })} tone="danger" onPress={onBlock} />
      </Card>
    </Screen>
  );
}
