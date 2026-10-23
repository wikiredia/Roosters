import { router } from 'expo-router';
import { View } from 'react-native';

import { useCheckin, useToday } from '@/api/hooks';
import type { Checkin, Friend, Notification, Today } from '@/api/types';
import { SetupSteps } from '@/components/SetupSteps';
import { isOff } from '@/components/timetable/Timetable';
import { Avatar, AvatarStack, Banner, StatusOption, Tag } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Card, Row, Section, SectionHead, TogetherCard, TogetherIcon } from '@/components/ui/Layout';
import { Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT, type Key } from '@/i18n';
import { currentLesson, isAway, joinNames, nextLesson, statusLine } from '@/lib/status';
import { addDays, hhmm, isoDay, longDate, minutesAgo, parseDay, range, shortDate } from '@/lib/time';

type T = ReturnType<typeof useT>['t'];

/** Vandaag: where you are now, who you can take a break with, who is around. */
export default function TodayScreen() {
  const { t, lang } = useT();
  const today = useToday();
  const checkin = useCheckin();
  const d = today.data;
  const date = d ? parseDay(d.day) : new Date();
  const home = d?.me.checkin?.status === 'home' || d?.me.checkin?.status === 'absent';

  return (
    <Screen
      eyebrow={longDate(date, lang)}
      title={t('today.title')}
      right={
        d && d.me.lessons.length > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            icon={home ? 'logout' : 'pin'}
            label={home ? t('today.atHome') : t('today.atSchool')}
            accessibilityHint={t('today.placeHint')}
            onPress={() => checkin.mutate(home ? null : 'home')}
          />
        ) : null
      }
      refreshing={today.isRefetching}
      onRefresh={() => today.refetch()}
    >
      {!d ? (
        <Loading />
      ) : (
        <>
          <SyncNote d={d} t={t} />
          <NowCard d={d} t={t} />
          {/* Skipped in onboarding (e-mail, school, timetable, friends): finish it here */}
          <SetupSteps d={d} />
          {d.friends.length > 0 ? (
            <>
              <Together d={d} t={t} />
              <Board d={d} t={t} />
            </>
          ) : null}
          <Plan d={d} t={t} onPick={(s) => checkin.mutate(d.me.checkin?.status === s ? null : s)} />
          <Changes changes={d.changes} today={d.day} t={t} lang={lang} />
          <Updated at={d.sources.updated_at} t={t} />
        </>
      )}
    </Screen>
  );
}

function Loading() {
  return (
    <View className="gap-4">
      <View className="bg-you-soft rounded-card p-4 gap-3 h-40">
        <Skeleton width={60} />
        <Skeleton width={200} className="h-7" />
        <Skeleton width={160} />
      </View>
      <Card className="p-4 gap-3">
        <Skeleton width={180} />
        <Skeleton width={120} />
      </Card>
    </View>
  );
}

/** "Bijgewerkt 4 min geleden" or a calm note when Untis didn't answer. */
function SyncNote({ d, t }: { d: Today; t: T }) {
  const s = d.sources;
  if (s.errors.length > 0) {
    return <Banner kind="neutral" icon="refresh" title={t('today.untisDown')} body={t('today.lastKnown')} />;
  }
  return null;
}

function Updated({ at, t }: { at: string | null; t: T }) {
  const m = minutesAgo(at);
  if (m == null) return null;
  return (
    <Text variant="xs" tone="ink3" className="text-center">
      {m < 1 ? t('today.updatedNow') : m < 120 ? t('today.updatedMin', { n: m }) : t('today.updatedHours', { n: Math.round(m / 60) })}
    </Text>
  );
}

function NowCard({ d, t }: { d: Today; t: T }) {
  const { lang } = useT();
  const { lessons, status } = d.me;
  const now = d.now;
  const active = lessons.filter((l) => !isOff(l));
  const cancelled = lessons.filter((l) => isOff(l));
  const cur = currentLesson(active, now);
  const next = nextLesson(active.filter((l) => l !== cur), now);

  let title: string;
  let sub: string | null = null;
  switch (status.code) {
    case 'in_class':
      title = cur?.course ?? t('today.inClass');
      sub = [t('today.until', { t: hhmm(status.until) }), cur?.location].filter(Boolean).join(' · ');
      break;
    case 'break':
    case 'chilling':
    case 'wants_to_chill':
      title = status.until ? t('today.breakUntil', { t: hhmm(status.until) }) : t('today.free');
      break;
    case 'later':
      title = t('today.firstAt', { t: hhmm(status.until) });
      break;
    case 'done':
      title = t('today.done');
      break;
    case 'home':
    case 'absent':
      title = active.length ? t('today.notComing') : t('today.noClasses');
      break;
    default:
      title = t('today.noClasses');
  }
  const weekend = [0, 6].includes(parseDay(d.day).getDay());
  if (!active.length && weekend) title = t('today.weekend');

  return (
    <View className="bg-you rounded-card p-4 gap-3">
      <View className="self-start bg-white/20 rounded-full px-2.5 py-0.5">
        <Text variant="xs" bold tone="onYou">
          {t('today.now')}
        </Text>
      </View>
      <View className="gap-1">
        <Text variant="titleXl" tone="onYou">
          {title}
        </Text>
        {sub ? <Text tone="onYou">{sub}</Text> : null}
        {weekend && !active.length ? <Text tone="onYou">{t('today.weekendBody')}</Text> : null}
        {cancelled.length > 0 ? (
          <Text tone="onYou">{t('today.cancelledToday', { courses: joinNames([...new Set(cancelled.map((l) => l.course ?? ''))], t('common.and')) })}</Text>
        ) : null}
      </View>
      {next && status.code !== 'later' ? (
        <View className="flex-row flex-wrap gap-x-1.5">
          <Text tone="onYou">{t('today.next')}</Text>
          <Text bold tone="onYou">
            {[next.course, hhmm(next.start), next.location].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : status.code === 'later' && next ? (
        <Text bold tone="onYou">
          {[next.course, next.location].filter(Boolean).join(' · ')}
        </Text>
      ) : !active.length || status.code === 'done' ? (
        <TomorrowLine day={d.day} t={t} lang={lang} />
      ) : null}
      <Button variant="onYou" size="sm" icon="calendar" label={t('today.openRooster')} onPress={() => router.push('/rooster')} className="self-start" />
    </View>
  );
}

/** "Maandag begin je om 08:30" from the cached Today of the next school day, if we have it. */
function TomorrowLine({ day, t, lang }: { day: string; t: T; lang: 'nl' | 'en' }) {
  const base = parseDay(day);
  let next = addDays(base, 1);
  while ([0, 6].includes(next.getDay())) next = addDays(next, 1);
  const q = useToday(isoDay(next));
  const first = q.data?.me.lessons.find((l) => !isOff(l));
  if (!first) return null;
  const when = isoDay(next) === isoDay(addDays(base, 1)) ? t('today.tomorrow') : shortDate(next, lang);
  return (
    <Text tone="onYou">
      {t('today.nextDay', { day: when, t: hhmm(first.start), course: first.course ?? '' })}
    </Text>
  );
}

/** "Pak je pauze met:" — shared breaks, grouped per time slot. */
function Together({ d, t }: { d: Today; t: T }) {
  const byId = new Map(d.friends.map((f) => [f.id, f]));
  const groups = new Map<string, { start: number; end: number; people: Friend[] }>();
  for (const s of d.together) {
    const f = byId.get(s.id);
    if (!f) continue;
    const k = `${s.start}-${s.end}`;
    const g = groups.get(k) ?? { start: s.start, end: s.end, people: [] };
    g.people.push(f);
    groups.set(k, g);
  }
  const list = [...groups.values()].sort((a, b) => a.start - b.start);
  if (list.length === 0) {
    return (
      <Card className="p-4 gap-1">
        <Text bold>{t('today.noTogether')}</Text>
        <Text variant="sm" tone="ink2">
          {t('today.noTogetherBody')}
        </Text>
      </Card>
    );
  }
  return (
    <Section>
      <SectionHead title={t('today.together')} left={<TogetherIcon />} />
      <TogetherCard>
        {list.map((g, i) => {
          const live = g.start <= d.now;
          return (
            <Row
              key={`${g.start}-${g.end}`}
              first={i === 0}
              divider="together"
              title={joinNames(g.people.map((p) => p.display_name), t('common.and'))}
              sub={live ? t('today.nowUntil', { t: hhmm(g.end) }) : range(g.start, g.end)}
              left={<AvatarStack people={g.people.map((p) => ({ name: p.display_name, color: p.avatar_color }))} size="md" ring="together" />}
              chevron
              onPress={() => router.push({ pathname: '/compare', params: { ids: g.people.map((p) => p.id).join(',') } })}
            />
          );
        })}
      </TogetherCard>
    </Section>
  );
}

/** "Wie is er nu?" — free first; people who aren't on campus folded into one row. */
function Board({ d, t }: { d: Today; t: T }) {
  const byId = new Map(d.friends.map((f) => [f.id, f]));
  const here = d.board.filter((b) => !isAway(b.status));
  const away = d.board.filter((b) => isAway(b.status));
  return (
    <Section>
      <SectionHead title={t('today.board')} aside={t('today.freeFirst')} />
      <Card>
        {here.map((b, i) => {
          const f = byId.get(b.id);
          if (!f) return null;
          const line = statusLine(b.status, t);
          return (
            <Row
              key={b.id}
              first={i === 0}
              title={f.display_name}
              left={<Avatar name={f.display_name} color={f.avatar_color} presence={line.free ? 'free' : 'busy'} />}
              sub={
                <Text variant="sm" tone="ink2">
                  {line.strong ? (
                    <Text variant="sm" bold tone="success">
                      {line.strong}{' '}
                    </Text>
                  ) : null}
                  {line.text}
                </Text>
              }
              chevron
              onPress={() => router.push(`/friends/${f.id}`)}
            />
          );
        })}
        {away.length > 0 ? (
          <Row
            first={here.length === 0}
            left={<AvatarStack people={away.map((b) => ({ name: byId.get(b.id)?.display_name ?? '?', color: byId.get(b.id)?.avatar_color ?? 1 }))} size="sm" />}
            title={t('today.away', { n: away.length })}
            sub={away.map((b) => byId.get(b.id)?.display_name).filter(Boolean).join(', ')}
            onPress={() => router.push('/friends')}
          />
        ) : null}
      </Card>
    </Section>
  );
}

const PLAN: { status: Checkin['status']; label: Key }[] = [
  { status: 'chilling', label: 'plan.chilling' },
  { status: 'want_chill', label: 'plan.wantChill' },
  { status: 'home', label: 'plan.home' },
  { status: 'absent', label: 'plan.absent' },
];

/** "Wat is je plan deze middag?" — your own status for friends. */
function Plan({ d, t, onPick }: { d: Today; t: T; onPick: (s: Checkin['status']) => void }) {
  const mine = d.me.checkin?.status;
  const hasLessons = d.me.lessons.some((l) => !isOff(l));
  const options = hasLessons ? PLAN : PLAN.filter((p) => p.status !== 'home');
  const until = d.me.status.until;
  return (
    <Section>
      <SectionHead title={hasLessons ? t('plan.title') : t('plan.titleFree')} aside={hasLessons && until ? t('plan.until', { t: hhmm(until) }) : undefined} />
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2.5">
        {options.map((o) => (
          <StatusOption key={o.status} label={t(o.status === 'chilling' && !hasLessons ? 'plan.onCampus' : o.label)} on={mine === o.status} onPress={() => onPick(o.status)} />
        ))}
      </View>
      <Text variant="sm" tone="ink2">
        {t('plan.note')}
      </Text>
    </Section>
  );
}

function Changes({ changes, today, t, lang }: { changes: Notification[]; today: string; t: T; lang: 'nl' | 'en' }) {
  if (changes.length === 0) return null;
  const tomorrow = isoDay(addDays(parseDay(today), 1));
  return (
    <Section>
      <SectionHead title={t('today.changes')} />
      <Card>
        {changes.slice(0, 5).map((n, i) => {
          const c = n.payload;
          const when = c.day === today ? t('today.todayLower') : c.day === tomorrow ? t('today.tomorrow') : shortDate(parseDay(c.day), lang);
          const tag =
            c.type === 'cancelled' ? (
              <Tag kind="bad">{t('tt.cancelled')}</Tag>
            ) : c.type === 'new' ? (
              <Tag kind="ok">{t('change.new')}</Tag>
            ) : (
              <Tag kind="ink">{t('tt.changed')}</Tag>
            );
          const moved = c.type === 'changed' && c.old;
          const time = moved && c.old!.start_min !== c.start_min ? `${hhmm(c.old!.start_min)} → ${hhmm(c.start_min)}` : range(c.start_min, c.end_min);
          const room = moved && c.old!.location !== c.location ? `${c.old!.location ?? '–'} → ${c.location ?? '–'}` : c.location;
          return (
            <Row key={n.id} first={i === 0} left={tag} title={`${c.course} ${time}`} sub={[when, room].filter(Boolean).join(' · ')} />
          );
        })}
      </Card>
    </Section>
  );
}
