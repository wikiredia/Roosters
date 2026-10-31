import { type Href, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { SlideInLeft } from 'react-native-reanimated';

import { useFriends, useWeeks } from '@/api/hooks';
import type { Friend, Lesson } from '@/api/types';
import { CalendarScreen } from '@/components/timetable/CalendarScreen';
import { friendColor } from '@/components/timetable/Lanes';
import { isFree } from '@/components/timetable/Timetable';
import { Avatar, Check, PinMark } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, Row, Section, SectionHead } from '@/components/ui/Layout';
import { AView } from '@/components/ui/Motion';
import { BottomTabs } from '@/components/BottomTabs';
import { Empty, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { dateAt, dayIndex, mondayOf, weekdayOf } from '@/lib/days';
import { prefs } from '@/lib/storage';
import { isoDay, nowMin, parseDay } from '@/lib/time';

/** Free while comparing; more than this is Premium (later). Same limit as the server. */
const MAX_FREE = 3;

/** How many days the calendar starts with: two when you compare with at most two friends (three people), else one;
 * pinch or drag the strip for more, as on the Rooster tab. */
function startDays(people: number) {
  return people <= 3 ? 2 : 1;
}

/** The first day to show: today on a weekday, otherwise next Monday. */
function firstDay(today: number) {
  return weekdayOf(today) <= 4 ? today : mondayOf(today) + 7;
}

/** The lesson week to compare: this one, unless your lessons for it are over (Friday afternoon, the weekend):
 * then next week. */
function lessonWeek(lessons: Lesson[] | undefined, today: number) {
  const mon = mondayOf(today);
  const now = nowMin();
  const left = (lessons ?? []).some((l) => {
    if (isFree(l)) return false;
    const d = dayIndex(parseDay(l.day));
    return d > today || (d === today && l.end > now);
  });
  return left ? mon : mon + 7;
}

/**
 * Vergelijken, in two steps: tick friends (up to 3 for free; the ones you pinned are suggested first), then
 * 'Vergelijk' shows the Rooster tab's own screen and calendar (components/timetable/CalendarScreen, the same code, so
 * the same controls and height) with a lane per person in every day: you, then each friend in their own colour
 * (their faces top right have a ring in that colour; no legend). Tap a friend's class for its details, drag it into
 * the bin to ask whether they'd skip it; a lane with nothing that day is narrow, 'Leeg'. With `ids` (a friend's page, a
 * chat's +) it opens on the calendar straight away. The + top right goes back to the list; the back arrow goes back
 * to the list when you came from it, else closes Vergelijken. No swiping back on the calendar: it would get mixed up
 * with swiping through the days.
 */
export default function CompareScreen() {
  const { t } = useT();
  const params = useLocalSearchParams<{ ids?: string }>();
  const [picked, setPicked] = useState<number[]>(() => (params.ids ? params.ids.split(',').map(Number).filter(Boolean) : []));
  const [step, setStep] = useState<'who' | 'week'>(params.ids ? 'week' : 'who');
  // Came to the calendar from the list on this screen: the back arrow goes back to it
  const [fromList, setFromList] = useState(false);
  const friends = useFriends();
  const today = dayIndex(new Date());
  const [thisWeek] = useWeeks([isoDay(dateAt(mondayOf(today)))]);
  const start = lessonWeek(thisWeek?.data?.lessons, today);
  const [week] = useWeeks([isoDay(dateAt(start))]);
  // How often you compared with whom (on this phone): the three you pick most are suggested on top
  const [picks, setPicks] = useState<Record<string, number>>({});
  useEffect(() => {
    prefs.get<Record<string, number>>('compare.picks', {}).then(setPicks);
  }, []);

  const byId = new Map((friends.data ?? []).map((f) => [f.id, f]));
  const ids = useMemo(() => picked.slice(0, MAX_FREE), [picked]);
  const chosen = ids.map((id) => byId.get(id)).filter((f): f is Friend => !!f);
  const over = picked.length > MAX_FREE;

  // Shared breaks in the week you'll compare, per friend
  const shared = new Map<number, number>();
  for (const day of Object.values(week?.data?.together ?? {})) for (const s of day) shared.set(s.id, (shared.get(s.id) ?? 0) + 1);
  // Suggestions: the friends you pinned, then the ones you pick most (no history yet: the ones you share most breaks
  // with), 3 in all or every pinned one; only these show a count, the full comparison is what Vergelijken (and
  // Premium, later) is for. Everyone else in the API's order (pinned first, then by name)
  const all = friends.data ?? [];
  const pins = all.filter((f) => f.pinned);
  const byPicks = all.filter((f) => !f.pinned && picks[f.id]).sort((a, b) => picks[b.id] - picks[a.id]);
  const byShared = all.filter((f) => !f.pinned && shared.get(f.id)).sort((a, b) => (shared.get(b.id) ?? 0) - (shared.get(a.id) ?? 0));
  const suggested = [...pins, ...(byPicks.length ? byPicks : byShared)].slice(0, Math.max(3, pins.length));
  const rest = all.filter((f) => !suggested.includes(f));

  function go() {
    const next = { ...picks };
    for (const id of ids) next[id] = (next[id] ?? 0) + 1;
    setPicks(next);
    prefs.set('compare.picks', next);
    setFromList(true);
    setStep('week');
  }

  const row = (f: Friend, i: number, count: boolean) => (
    <Row
      key={f.id}
      first={i === 0}
      left={<Avatar name={f.display_name} color={f.avatar_color} uid={f.id} photo={f.photo} />}
      title={f.display_name}
      sub={f.hidden ? t('status.hidden') : count ? t('compare.sharedWeek', { n: shared.get(f.id) ?? 0 }) : undefined}
      right={
        <View className="flex-row items-center gap-2">
          {f.pinned ? <PinMark label={t('friend.pinned')} /> : null}
          <Check on={picked.includes(f.id)} />
        </View>
      }
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked.includes(f.id) }}
      onPress={() => toggle(f.id)}
    />
  );

  function toggle(id: number) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  // Vergelijken keeps the tab bar (Rooster lit); a tab goes back to the tabs
  const tabs = <BottomTabs active="rooster" onSelect={(name) => router.navigate(`/${name}` as Href)} />;

  if (step === 'week') {
    const leave = () => (router.canGoBack() ? router.back() : router.navigate('/rooster'));
    return (
      <View className="flex-1 bg-bg">
        <Stack.Screen options={{ gestureEnabled: false }} />
        <CalendarScreen
          key={ids.join()}
          title={t('compare.title')}
          onBack={fromList ? () => setStep('who') : leave}
          compare={ids}
          initialStart={firstDay(today)}
          initialDays={startDays(ids.length + 1)}
          right={<Faces friends={chosen} onAdd={() => setStep('who')} addLabel={t('compare.add')} />}
        />
        {tabs}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
    <Stack.Screen options={{ gestureEnabled: true }} />
    <Screen
      back
      navTitle={t('compare.title')}
      footer={
        friends.data?.length ? (
          <Button icon="swap" label={chosen.length ? t('compare.go', { n: chosen.length }) : t('compare.pickFirst')} disabled={!chosen.length} onPress={go} />
        ) : undefined
      }
    >
      {friends.data && friends.data.length === 0 ? (
        <Empty
          title={t('compare.noFriends')}
          body={t('today.noFriendsBody')}
          action={
            <Text bold tone="you" onPress={() => router.push('/friends/add')}>
              {t('me.addFriend')}
            </Text>
          }
        />
      ) : (
        <AView entering={params.ids ? SlideInLeft.duration(240) : undefined}>
          <Section>
            <SectionHead title={t('compare.who')} aside={t('compare.picked', { n: picked.length })} />
            {suggested.length ? (
              <View className="gap-2">
                <Text variant="sm" bold tone="ink2">
                  {t('compare.forYou')}
                </Text>
                <Card>{suggested.map((f, i) => row(f, i, true))}</Card>
              </View>
            ) : null}
            {rest.length ? (
              <View className="gap-2">
                {suggested.length ? (
                  <Text variant="sm" bold tone="ink2">
                    {t('compare.everyone')}
                  </Text>
                ) : null}
                <Card>{rest.map((f, i) => row(f, i, false))}</Card>
              </View>
            ) : null}
            <View>
              <Text variant="sm" tone={over ? 'premium' : 'ink2'}>
                {over ? t('compare.overLimit', { n: MAX_FREE }) : t('compare.limit', { n: MAX_FREE })}
              </Text>
            </View>
          </Section>
        </AView>
      )}
    </Screen>
    {tabs}
    </View>
  );
}

/** Who you compare with, top right: their faces, each with a ring in their colour on the calendar, and + to add or
 * change (back to the list). */
function Faces({ friends, onAdd, addLabel }: { friends: Friend[]; onAdd: () => void; addLabel: string }) {
  return (
    <View className="flex-row items-center">
      {friends.map((f, i) => (
        <View key={f.id} accessibilityLabel={f.display_name} className="rounded-full border-2 bg-bg" style={{ borderColor: friendColor(i), marginLeft: i ? -6 : 0, padding: 1 }}>
          <Avatar name={f.display_name} color={f.avatar_color} uid={f.id} photo={f.photo} size="sm" />
        </View>
      ))}
      <IconButton icon="plus" label={addLabel} onPress={onAdd} className="ml-1.5 w-9 h-9 rounded-full border-[1.5px] border-line-strong" />
    </View>
  );
}
