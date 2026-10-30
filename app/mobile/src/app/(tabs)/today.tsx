import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useChats, useCheckin, useOpenDirect, useToday } from '@/api/hooks';
import type { Checkin, Friend, Notification, Today } from '@/api/types';
import { BreakSheet, type BreakTarget } from '@/components/BreakSheet';
import { SetupSteps } from '@/components/SetupSteps';
import { freeGaps, isFree, isOff, mergeLessons, STATE_LABEL } from '@/components/timetable/Timetable';
import { Avatar, AvatarStack, Banner, PinMark, StatusOption, Tag } from '@/components/ui/Bits';
import { Toggle } from '@/components/ui/Inputs';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, Row, Section, SectionHead, TogetherCard, TogetherIcon } from '@/components/ui/Layout';
import { Reveal } from '@/components/ui/Motion';
import { Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { slotState } from '@/lib/breaks';
import { pinnedOnTop } from '@/lib/friends';
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
  const [sheet, setSheet] = useState<BreakTarget>(null);

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
            onPress={() => checkin.mutate({ status: home ? null : 'home' })}
          />
        ) : null
      }
      onRefresh={() => today.refetch()}
    >
      {/* Every section fades in, and slides when one above it appears or goes (no jumping); the ones that may
          be empty do it themselves, so an empty one adds no gap */}
      {!d ? (
        <Reveal>
          <Loading />
        </Reveal>
      ) : (
        <>
          <SyncNote d={d} t={t} />
          <Reveal>
            <NowCard d={d} t={t} />
          </Reveal>
          {/* Skipped in onboarding (e-mail, school, timetable, friends): finish it here */}
          <SetupSteps d={d} />
          {d.friends.length > 0 ? (
            <Reveal className="gap-6">
              <Together d={d} t={t} onAsk={(people) => setSheet({ kind: 'ask', day: d.day, people })} />
              <Board d={d} t={t} />
            </Reveal>
          ) : null}
          <Reveal>
            <Plan
              d={d}
              t={t}
              // Tapping what you picked again takes it back
              onStatus={(s) => checkin.mutate({ status: d.me.checkin?.status === s ? null : s })}
              onBreak={(b) => checkin.mutate({ break_status: d.me.checkin?.break_status === b ? null : b })}
            />
          </Reveal>
          <Changes changes={d.changes} today={d.day} t={t} lang={lang} />
          <Updated at={d.sources.updated_at} t={t} />
        </>
      )}
      <BreakSheet target={sheet} onClose={() => setSheet(null)} />
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
    return (
      <Reveal>
        <Banner kind="neutral" icon="refresh" title={t('today.untisDown')} body={t('today.lastKnown')} />
      </Reveal>
    );
  }
  return null;
}

function Updated({ at, t }: { at: string | null; t: T }) {
  const m = minutesAgo(at);
  if (m == null) return null;
  return (
    <Reveal>
      <Text variant="xs" tone="ink3" className="text-center">
        {m < 1 ? t('today.updatedNow') : m < 120 ? t('today.updatedMin', { n: m }) : t('today.updatedHours', { n: Math.round(m / 60) })}
      </Text>
    </Reveal>
  );
}

function NowCard({ d, t }: { d: Today; t: T }) {
  const { lang } = useT();
  const { lessons, status } = d.me;
  const now = d.now;
  // Skipped ones don't count as classes you have (lib/skips.ts); cancelled ones are mentioned below. Back-to-back
  // periods of a course are one class, as in the Rooster tab: not "next: the same class an hour later"
  const active = mergeLessons(lessons.filter((l) => !isFree(l)));
  const cancelled = lessons.filter((l) => isOff(l));
  const cur = currentLesson(active, now);
  const next = nextLesson(active.filter((l) => l !== cur), now);

  let title: string;
  let sub: string | null = null;
  switch (status.code) {
    case 'in_class':
      title = cur?.course ?? t('today.inClass');
      // The end of this class, not of the whole run of classes the status counts as busy
      sub = [t('today.until', { t: hhmm(cur?.end ?? status.until) }), cur?.location].filter(Boolean).join(' · ');
      break;
    case 'break':
    case 'break_busy':
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
  const first = q.data?.me.lessons.find((l) => !isFree(l));
  if (!first) return null;
  const when = isoDay(next) === isoDay(addDays(base, 1)) ? t('today.tomorrow') : shortDate(next, lang);
  return (
    <Text tone="onYou">
      {t('today.nextDay', { day: when, t: hhmm(first.start), course: first.course ?? '' })}
    </Text>
  );
}

/**
 * "Pak je pauze met:" — shared breaks, grouped per time slot (pinned friends first in each). Tap one to ask "Pauze
 * samen?"; once asked (or planned, or a no) the row opens the chat where that request's card is instead.
 */
function Together({ d, t, onAsk }: { d: Today; t: T; onAsk: (people: (Friend & { start: number; end: number })[]) => void }) {
  const open = useOpenDirect();
  const chats = useChats();
  // One friend: your chat with them. Several: the group with exactly them in it (where the card went), else the
  // Chat tab (one card in each direct chat)
  async function openChat(people: Friend[]) {
    if (people.length === 1) return router.push(`/chat/${(await open.mutateAsync(people[0].id)).id}`);
    const ids = new Set(people.map((p) => p.id));
    const group = chats.data?.chats.find((c) => c.kind === 'group' && c.members.length === ids.size && c.members.every((m) => ids.has(m.id)));
    router.push(group ? `/chat/${group.id}` : '/chat');
  }
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
  // Within one break, friends you pinned named first
  const list = [...groups.values()].map((g) => ({ ...g, people: pinnedOnTop(g.people, (p) => p.pinned) })).sort((a, b) => a.start - b.start);
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
          const state = slotState(d.breaks, g.people.map((p) => p.id), d.day, Math.max(g.start, d.now), g.end);
          return (
            <Row
              key={`${g.start}-${g.end}`}
              first={i === 0}
              divider="together"
              title={joinNames(g.people.map((p) => p.display_name), t('common.and'))}
              sub={live ? t('today.nowUntil', { t: hhmm(g.end) }) : range(g.start, g.end)}
              left={<AvatarStack people={g.people.map((p) => ({ name: p.display_name, color: p.avatar_color, uid: p.id, photo: p.photo }))} size="md" ring="together" />}
              chevron={g.people.length > 1 || !!state}
              right={
                // One friend: a chat with them is one tap away (the row itself asks for the break)
                g.people.length === 1 ? (
                  <IconButton
                    icon="chat"
                    filled
                    label={t('friend.chat', { name: g.people[0].display_name })}
                    onPress={async () => router.push(`/chat/${(await open.mutateAsync(g.people[0].id)).id}`)}
                  />
                ) : undefined
              }
              accessibilityHint={state ? t('today.openChat') : t('break.title')}
              onPress={() => (state ? openChat(g.people) : onAsk(g.people.map((p) => ({ ...p, start: Math.max(g.start, d.now), end: g.end }))))}
            >
              {/* Asked already, planned or a no: says so, and the row goes to the chat with the card */}
              {state ? (
                <View className="flex-row pt-1">
                  <Tag kind={STATE_TAG[state]} icon={state === 'planned' ? 'check' : undefined}>
                    {t(STATE_LABEL[state])}
                  </Tag>
                </View>
              ) : null}
            </Row>
          );
        })}
      </TogetherCard>
    </Section>
  );
}

/** A break's state as a small tag: the same colours as the calendar, at the size of a word. */
const STATE_TAG = { planned: 'together', asked: 'line', declined: 'bad' } as const;

/**
 * "Wie is er nu?" — tap a friend for your chat with them. Friends you pinned on top (with a thumbtack, also when they're not on campus), then free first;
 * the others who aren't on campus folded into one row. The server sorts it the same way; sorting here again keeps
 * a pin you just set in place before Today is fetched again.
 */
function Board({ d, t }: { d: Today; t: T }) {
  const open = useOpenDirect();
  const byId = new Map(d.friends.map((f) => [f.id, f]));
  const pinned = (id: number) => !!byId.get(id)?.pinned;
  const board = pinnedOnTop(d.board, (b) => pinned(b.id));
  const here = board.filter((b) => pinned(b.id) || !isAway(b.status));
  const away = board.filter((b) => !pinned(b.id) && isAway(b.status));
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
              left={<Avatar name={f.display_name} color={f.avatar_color} uid={f.id} photo={f.photo} presence={line.free ? 'free' : 'busy'} />}
              right={f.pinned ? <PinMark label={t('friend.pinned')} /> : undefined}
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
              // To your chat with them: where you'd ask, and where their requests are
              accessibilityHint={t('today.openChat')}
              onPress={async () => router.push(`/chat/${(await open.mutateAsync(f.id)).id}`)}
            />
          );
        })}
        {away.length > 0 ? (
          <Row
            first={here.length === 0}
            left={<AvatarStack people={away.map((b) => ({ name: byId.get(b.id)?.display_name ?? '?', color: byId.get(b.id)?.avatar_color ?? 1, uid: b.id, photo: byId.get(b.id)?.photo }))} size="sm" />}
            title={t('today.away', { n: away.length })}
            sub={away.map((b) => byId.get(b.id)?.display_name).filter(Boolean).join(', ')}
            onPress={() => router.push('/friends')}
          />
        ) : null}
      </Card>
    </Section>
  );
}

type Status = NonNullable<Checkin['status']>;
type BreakStatus = NonNullable<Checkin['break_status']>;

const BREAK: { value: BreakStatus; label: 'plan.meet' | 'plan.busy' }[] = [
  { value: 'want_chill', label: 'plan.meet' },
  { value: 'busy', label: 'plan.busy' },
];
const AFTER: { value: Status; label: 'plan.chilling' | 'plan.wantChill' }[] = [
  { value: 'chilling', label: 'plan.chilling' },
  { value: 'want_chill', label: 'plan.wantChill' },
];

/**
 * Your own status for friends, in two parts, always there on a school day (also once school is over, so you see and
 * can change what you said). "In je pauze" (break_status), with the next break's time: busy means nobody is matched
 * with you in your breaks. "Na school" (status): staying makes after school count as a break, so friends who stay
 * too are matched with you (the server's `logic.day_info`; the Rooster tab draws it as your break). Nothing about the
 * time before school. Tap a choice again to take it back. "Ik ben er vandaag niet" is a small toggle under it; "naar
 * huis" is the button in the header. A day without classes: "Toch op de campus?".
 */
function Plan({ d, t, onStatus, onBreak }: { d: Today; t: T; onStatus: (s: Status | null) => void; onBreak: (b: BreakStatus) => void }) {
  const status = d.me.checkin?.status ?? null;
  const brk = d.me.checkin?.break_status ?? null;
  const lessons = d.me.lessons.filter((l) => !isFree(l));
  const note = (
    <Text variant="sm" tone="ink2">
      {t('plan.note')}
    </Text>
  );
  if (lessons.length === 0) {
    return (
      <Section>
        <SectionHead title={t('plan.titleFree')} />
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2.5">
          {AFTER.map((o) => (
            <StatusOption key={o.value} label={t(o.value === 'chilling' ? 'plan.onCampus' : o.label)} on={status === o.value} onPress={() => onStatus(o.value)} />
          ))}
        </View>
        {note}
      </Section>
    );
  }
  const last = Math.max(...lessons.map((l) => l.end));
  // The next break between classes that isn't over yet (none left: still there, so you can see and change your plan)
  const next = freeGaps(d.me.lessons).find((g) => g.end > d.now);
  return (
    <View className="gap-5">
      <Section>
        <SectionHead
          title={t('plan.break')}
          aside={!next ? t('plan.noBreakLeft') : next.start <= d.now ? t('plan.breakNow', { t: hhmm(next.end) }) : range(next.start, next.end)}
        />
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2.5">
          {BREAK.map((o) => (
            <StatusOption key={o.value} label={t(o.label)} on={brk === o.value} onPress={() => onBreak(o.value)} />
          ))}
        </View>
      </Section>
      <Section>
        <SectionHead title={t('plan.after')} aside={t('plan.afterAt', { t: hhmm(last) })} />
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2.5">
          {AFTER.map((o) => (
            <StatusOption key={o.value} label={t(o.label)} on={status === o.value} onPress={() => onStatus(o.value)} />
          ))}
        </View>
      </Section>
      {note}
      <Card>
        <Row
          first
          title={t('plan.absent')}
          sub={status === 'absent' ? t('plan.absentSub') : undefined}
          right={<Toggle value={status === 'absent'} onChange={(v) => onStatus(v ? 'absent' : null)} label={t('plan.absent')} />}
        />
      </Card>
    </View>
  );
}

function Changes({ changes, today, t, lang }: { changes: Notification[]; today: string; t: T; lang: 'nl' | 'en' }) {
  if (changes.length === 0) return null;
  const tomorrow = isoDay(addDays(parseDay(today), 1));
  return (
    <Reveal className="gap-3">
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
    </Reveal>
  );
}
