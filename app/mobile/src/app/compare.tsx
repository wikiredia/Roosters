import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SlideInLeft, SlideInRight } from 'react-native-reanimated';

import { useFriends, useWeeks } from '@/api/hooks';
import type { Friend, Lesson } from '@/api/types';
import { Calendar, rangeLabel } from '@/components/timetable/Calendar';
import { isOff } from '@/components/timetable/Timetable';
import { Avatar, AvatarStack, Check } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Card, Row, Section, SectionHead } from '@/components/ui/Layout';
import { AView } from '@/components/ui/Motion';
import { Empty, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { dateAt, dayIndex, mondayOf } from '@/lib/days';
import { joinNames } from '@/lib/status';
import { prefs } from '@/lib/storage';
import { isoDay, nowMin, parseDay } from '@/lib/time';

/** Free while comparing; more than this is Premium (later). Same limit as the server. */
const MAX_FREE = 3;

/** The lesson week to compare: this one, unless your lessons for it are over (Friday afternoon, the weekend):
 * then next week. */
function lessonWeek(lessons: Lesson[] | undefined, today: number) {
  const mon = mondayOf(today);
  const now = nowMin();
  const left = (lessons ?? []).some((l) => {
    if (isOff(l)) return false;
    const d = dayIndex(parseDay(l.day));
    return d > today || (d === today && l.end > now);
  });
  return left ? mon : mon + 7;
}

/**
 * Vergelijken, in two steps: tick friends (up to 3 for free), then 'Vergelijk' shows the calendar of the Rooster tab
 * (the same one: swipe, pinch, double tap, tap a shared break to ask) with only the breaks you share with them,
 * on the current lesson week (or the next one when yours is over). With `ids` (a friend's page, a chat's +) it opens
 * on the calendar straight away; back goes to the list.
 */
export default function CompareScreen() {
  const { t, lang } = useT();
  const params = useLocalSearchParams<{ ids?: string }>();
  const [picked, setPicked] = useState<number[]>(() => (params.ids ? params.ids.split(',').map(Number).filter(Boolean) : []));
  const [step, setStep] = useState<'who' | 'week'>(params.ids ? 'week' : 'who');
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
  const ids = picked.slice(0, MAX_FREE);
  const chosen = ids.map((id) => byId.get(id)).filter((f): f is Friend => !!f);
  const over = picked.length > MAX_FREE;

  // Shared breaks in the week you'll compare, per friend
  const shared = new Map<number, number>();
  for (const day of Object.values(week?.data?.together ?? {})) for (const s of day) shared.set(s.id, (shared.get(s.id) ?? 0) + 1);
  // Suggestions: the 3 you pick most (no history yet: the 3 you share most breaks with); only these show a count,
  // the full comparison is what Vergelijken (and Premium, later) is for
  const all = friends.data ?? [];
  const byPicks = all.filter((f) => picks[f.id]).sort((a, b) => picks[b.id] - picks[a.id]);
  const suggested = (byPicks.length ? byPicks : [...all].filter((f) => shared.get(f.id)).sort((a, b) => (shared.get(b.id) ?? 0) - (shared.get(a.id) ?? 0))).slice(0, 3);
  const rest = all.filter((f) => !suggested.includes(f));

  function go() {
    const next = { ...picks };
    for (const id of ids) next[id] = (next[id] ?? 0) + 1;
    setPicks(next);
    prefs.set('compare.picks', next);
    setStep('week');
  }

  const row = (f: Friend, i: number, count: boolean) => (
    <Row
      key={f.id}
      first={i === 0}
      left={<Avatar name={f.display_name} color={f.avatar_color} uid={f.id} photo={f.photo} />}
      title={f.display_name}
      sub={f.hidden ? t('status.hidden') : count ? t('compare.sharedWeek', { n: shared.get(f.id) ?? 0 }) : undefined}
      right={<Check on={picked.includes(f.id)} />}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked.includes(f.id) }}
      onPress={() => toggle(f.id)}
    />
  );

  function toggle(id: number) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  if (step === 'week') {
    return (
      <Screen
        back
        onBack={() => setStep('who')}
        navTitle={t('compare.title')}
        navSub={rangeLabel(dateAt(start), dateAt(start + 4), lang)}
        scroll={false}
        contentClassName="flex-1 gap-2 pb-3"
      >
        <AView entering={SlideInRight.duration(240)} className="flex-1 gap-2">
          <Row
            first
            className="px-0 py-1 min-h-12"
            left={<AvatarStack people={chosen.map((f) => ({ name: f.display_name, color: f.avatar_color, uid: f.id, photo: f.photo }))} size="sm" />}
            title={t('compare.withNames', { names: joinNames(chosen.map((f) => f.display_name), t('common.and')) })}
            right={
              <Text variant="sm" bold tone="you">
                {t('compare.change')}
              </Text>
            }
            onPress={() => setStep('who')}
          />
          {over ? (
            <Text variant="sm" tone="premium">
              {t('compare.overLimit', { n: MAX_FREE })}
            </Text>
          ) : null}
          {/* Keyed on the week: the right week once your timetable is in */}
          <Calendar key={`${start}:${ids.join()}`} only={ids} initialStart={start} />
        </AView>
      </Screen>
    );
  }

  return (
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
  );
}
