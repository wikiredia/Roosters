import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useCompare, useFriends, useMe, useTodays } from '@/api/hooks';
import type { Friend } from '@/api/types';
import { type Column, dayBlocks, Legend, TimeGrid } from '@/components/timetable/Timetable';
import { Avatar, AvatarStack, Check } from '@/components/ui/Bits';
import { IconButton } from '@/components/ui/Button';
import { Card, Row, Section, SectionHead, TogetherCard, TogetherIcon } from '@/components/ui/Layout';
import { Empty, Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { joinNames } from '@/lib/status';
import { addDays, isoDay, nowMin, parseDay, range, shortDate } from '@/lib/time';

/** Free while comparing; more than this is Premium (later). Same limit as the server. */
const MAX_FREE = 3;

/** Vergelijken: tick friends, see when you're free together. */
export default function CompareScreen() {
  const { t, lang } = useT();
  const params = useLocalSearchParams<{ ids?: string; day?: string }>();
  const [day, setDay] = useState(() => params.day ?? isoDay(new Date()));
  const [picked, setPicked] = useState<number[]>(() => (params.ids ? params.ids.split(',').map(Number).filter(Boolean) : []));
  const friends = useFriends();
  const me = useMe();
  const myId = me.data?.id ?? 0;
  const ids = picked.slice(0, MAX_FREE);
  const compare = useCompare(ids, day);
  const [mine] = useTodays([day]);
  const todayIso = isoDay(new Date());

  const byId = new Map((friends.data ?? []).map((f) => [f.id, f]));
  const chosen = ids.map((id) => byId.get(id)).filter((f): f is Friend => !!f);
  const over = picked.length > MAX_FREE;

  function toggle(id: number) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const matches = (compare.data?.matches ?? []).filter((m) => m.ids.includes(myId));
  const name = (id: number) => (id === myId ? t('compare.you') : (byId.get(id)?.display_name ?? '?'));

  const columns: Column[] = [
    {
      key: 'me',
      blocks: dayBlocks(mine.data?.me.lessons ?? [], [], day === todayIso ? nowMin() : null),
    },
    ...chosen.map((f) => {
      const p = compare.data?.people.find((x) => x.id === f.id);
      const shared = matches.filter((m) => m.ids.includes(f.id));
      return {
        key: String(f.id),
        blocks: [
          ...(p?.busy ?? []).map(([start, end]) => ({ type: 'friend' as const, span: { start, end } })),
          ...shared.map((m) => ({ type: 'together' as const, span: { start: m.start, end: m.end }, label: '' })),
        ],
      };
    }),
  ];

  return (
    <Screen back navTitle={t('compare.title')}>
      <View className="flex-row items-center justify-between">
        <IconButton icon="back" label={t('compare.prevDay')} onPress={() => setDay(isoDay(addDays(parseDay(day), -1)))} />
        <Text bold>{day === todayIso ? `${t('today.title')} · ${shortDate(parseDay(day), lang)}` : shortDate(parseDay(day), lang)}</Text>
        <IconButton icon="forward" label={t('compare.nextDay')} onPress={() => setDay(isoDay(addDays(parseDay(day), 1)))} />
      </View>

      {friends.data && friends.data.length === 0 ? (
        <Empty title={t('compare.noFriends')} body={t('today.noFriendsBody')} action={<Text bold tone="you" onPress={() => router.push('/friends/add')}>{t('me.addFriend')}</Text>} />
      ) : (
        <Section>
          <SectionHead title={t('compare.who')} aside={t('compare.picked', { n: picked.length })} />
          <Card>
            {(friends.data ?? []).map((f, i) => (
              <Row
                key={f.id}
                first={i === 0}
                left={<Avatar name={f.display_name} color={f.avatar_color} />}
                title={f.display_name}
                sub={f.hidden ? t('status.hidden') : undefined}
                right={<Check on={picked.includes(f.id)} />}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: picked.includes(f.id) }}
                onPress={() => toggle(f.id)}
              />
            ))}
          </Card>
          <Text variant="sm" tone={over ? 'premium' : 'ink2'}>
            {over ? t('compare.overLimit', { n: MAX_FREE }) : t('compare.limit', { n: MAX_FREE })}
          </Text>
        </Section>
      )}

      {chosen.length > 0 ? (
        <>
          <Section>
            <SectionHead title={t('compare.together')} left={<TogetherIcon />} />
            {!compare.data ? (
              <Card className="p-4">
                <Skeleton width={180} />
              </Card>
            ) : matches.length ? (
              <TogetherCard>
                {matches.map((m, i) => {
                  const others = m.ids.filter((x) => x !== myId);
                  return (
                    <Row
                      key={`${m.ids.join('-')}-${m.start}`}
                      first={i === 0}
                      divider="together"
                      left={<AvatarStack people={others.map((x) => ({ name: name(x), color: byId.get(x)?.avatar_color ?? 1 }))} size="md" ring="together" />}
                      title={range(m.start, m.end)}
                      sub={t('rooster.with', { names: joinNames(others.map(name), t('common.and')) })}
                    />
                  );
                })}
              </TogetherCard>
            ) : (
              <Card className="p-4">
                <Text tone="ink2">{t('compare.none')}</Text>
              </Card>
            )}
          </Section>

          <Card className="p-2.5 gap-2">
            <View className="flex-row gap-1" style={{ paddingLeft: 44 }}>
              <View className="flex-1 items-center gap-1">
                <Avatar name={me.data?.display_name ?? '?'} color={0} size="sm" />
                <Text variant="xs" bold numberOfLines={1}>
                  {t('compare.you')}
                </Text>
              </View>
              {chosen.map((f) => (
                <View key={f.id} className="flex-1 items-center gap-1">
                  <Avatar name={f.display_name} color={f.avatar_color} size="sm" />
                  <Text variant="xs" bold numberOfLines={1}>
                    {f.display_name}
                  </Text>
                </View>
              ))}
            </View>
            <TimeGrid columns={columns} compact={chosen.length > 1} nowMin={day === todayIso ? nowMin() : null} />
          </Card>
          <Legend items={['theory', 'lab', 'friend', 'together']} />
        </>
      ) : null}
    </Screen>
  );
}
