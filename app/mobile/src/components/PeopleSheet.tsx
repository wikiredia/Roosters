import { router } from 'expo-router';
import { memo, useState } from 'react';
import { View } from 'react-native';

import { useOpenDirect, useUsualPartners } from '@/api/hooks';
import type { BreakPerson, Friend, Together } from '@/api/types';
import { Avatar, AvatarStack } from '@/components/ui/Bits';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/Button';
import { Card, Row } from '@/components/ui/Layout';
import { Skeleton } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { breakPlan, dayWord, duration } from '@/lib/breaks';
import { cn } from '@/lib/cn';
import { joinNames } from '@/lib/status';
import { hhmm, isoDay, range } from '@/lib/time';

import type { BreakPick } from './BreakSheet';

/** What the sheet lists, for a break on `day` (ISO) from `start` to `end`: the friends free then (a shared break,
 * each with their own window), or the friends you usually take a break with (your own break with nobody). */
export type PeopleTarget =
  | { kind: 'together'; day: string; start: number; end: number; people: BreakPick[]; plan?: PlanRow[] }
  | { kind: 'usual'; day: string; start: number; end: number; plan?: PlanRow[] }
  | null;

/** One stretch of your break with who's in it (none: alone), for the mini timetable on top of the sheet. */
export type PlanRow = { start: number; end: number; people: BreakPerson[] };

/**
 * What tapping a break opens (Rooster, Vergelijken): your whole break `gap` that day (today from now on), cut into
 * who's there when (`breakPlan`), and everyone you share a part of it with (each with their own free window), or,
 * with nobody, who you usually go with. `together`: who you share a break with that day (all friends, as the API
 * gives them); null when the break is already over.
 */
export function breakTarget(p: { day: string; gap: { start: number; end: number }; together: Together[]; friends: Friend[] | undefined; now: number }): PeopleTarget {
  const start = Math.max(p.gap.start, p.now);
  if (p.gap.end <= start) return null;
  const byId = new Map((p.friends ?? []).map((f) => [f.id, f]));
  const known = p.together.filter((s) => byId.has(s.id));
  const plan = breakPlan({ start, end: p.gap.end }, known).map((part) => ({ start: part.start, end: part.end, people: part.ids.map((id) => byId.get(id)!) }));
  const people = known
    .filter((s) => s.start < p.gap.end && start < s.end)
    .filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i)
    .map((s) => ({ ...byId.get(s.id)!, start: Math.max(s.start, start), end: Math.min(s.end, p.gap.end) }));
  return people.length ? { kind: 'together', day: p.day, start, end: p.gap.end, people, plan } : { kind: 'usual', day: p.day, start, end: p.gap.end, plan };
}

/** Pixels per minute of the mini timetable, and the shortest and tallest a stretch gets */
const PLAN_PX = 0.9;
const PLAN_MIN = 44;
const PLAN_MAX = 110;

/**
 * Your break as a mini timetable: a bar per stretch, taller when it's longer, grey when you're alone and yellow
 * with faces when you're with someone, the hour where it changes on the left and the length on the right. Read
 * top to bottom it says how the break goes without a sentence to read.
 */
export function BreakPlan({ plan }: { plan: PlanRow[] }) {
  const { t } = useT();
  return (
    <View accessible accessibilityLabel={plan.map((r) => `${range(r.start, r.end)}: ${r.people.length ? joinNames(r.people.map((p) => p.display_name), t('common.and')) : t('plan.alone')}`).join('. ')}>
      {plan.map((r, i) => {
        const alone = !r.people.length;
        const h = Math.max(PLAN_MIN, Math.min(PLAN_MAX, (r.end - r.start) * PLAN_PX));
        return (
          <View key={r.start} className="flex-row gap-2.5" style={{ height: h + 4 }}>
            <Text variant="xs" bold tone="ink2" className="w-11 text-right" style={{ marginTop: -7 }}>
              {hhmm(r.start)}
            </Text>
            <View
              className={cn('flex-1 flex-row items-center gap-2 rounded-[10px] px-3', alone ? 'bg-surface-sunken border-[1.5px] border-dashed border-line-strong' : 'bg-together border-[1.5px] border-together')}
              style={{ height: h, marginTop: i ? 4 : 0 }}
            >
              {alone ? <Icon name="coffee" size={18} color="ink-3" strokeWidth={1.75} /> : <AvatarStack people={r.people.map((p) => ({ name: p.display_name, color: p.avatar_color, uid: p.id, photo: p.photo }))} size="xs" ring="together" />}
              <Text variant="sm" bold tone={alone ? 'ink3' : 'onTogether'} numberOfLines={1} className="flex-1">
                {alone ? t('plan.alone') : joinNames(r.people.map((p) => p.display_name.split(/\s+/)[0]), t('common.and'))}
              </Text>
              <Text variant="xs" bold tone={alone ? 'ink3' : 'onTogether'}>
                {duration(r.end - r.start, t)}
              </Text>
            </View>
          </View>
        );
      })}
      <Text variant="xs" bold tone="ink2" className="w-11 text-right" style={{ marginTop: -3 }}>
        {hhmm(plan[plan.length - 1].end)}
      </Text>
    </View>
  );
}

/**
 * Tap a break on the calendar (Rooster, Vergelijken): who you could spend it with. A shared break lists the friends
 * free then ("Pauze mogelijk met:", their free window under the name); your own break with nobody lists who you
 * usually go with ("Meestal ga je met:", `useUsualPartners`, fetched only while it's open). A row opens your chat with
 * that friend (the sheet closes, the chat is pushed, so back returns here); its Vergelijk button opens Vergelijken with
 * them. Asking for the break itself happens in the chat now, not here.
 * Memo (like the calendar's other sheets): opening it renders this sheet and nothing else.
 */
export const PeopleSheet = memo(function PeopleSheet({ target, onClose }: { target: PeopleTarget; onClose: () => void }) {
  const { t, lang } = useT();
  // Keep showing the last content while the sheet slides away
  const [last, setLast] = useState(target);
  if (target && target !== last) setLast(target);
  const shown = target ?? last;
  const usual = useUsualPartners(target?.kind === 'usual');
  const open = useOpenDirect();
  const toChat = (id: number) => {
    if (open.isPending) return;
    open.mutate(id, {
      onSuccess: (chat) => {
        onClose();
        router.push(`/chat/${chat.id}`);
      },
    });
  };
  const toCompare = (id: number) => {
    onClose();
    router.push({ pathname: '/compare', params: { ids: String(id) } });
  };
  const rows: (BreakPerson & { sub: string })[] =
    shown?.kind === 'together'
      ? shown.people.map((p) => ({ ...p, sub: range(p.start, p.end) }))
      : (usual.data ?? []).map((p) => ({ ...p, sub: p.count ? t('people.times', { n: p.count }) : t('people.pinned') }));
  const loading = shown?.kind === 'usual' && usual.isLoading;
  return (
    <Sheet
      visible={!!target}
      onClose={onClose}
      closeLabel={t('common.close')}
      title={shown?.kind === 'usual' ? t('cal.usualTitle') : t('cal.togetherTitle')}
      sub={shown ? `${dayWord(shown.day, isoDay(new Date()), t, lang)} ${range(shown.start, shown.end)}` : undefined}
    >
      {shown?.plan && shown.plan.length ? (
        <View className="gap-2 pb-2">
          <Text variant="sm" bold tone="ink2">
            {t('plan.title')}
          </Text>
          <BreakPlan plan={shown.plan} />
        </View>
      ) : null}
      {loading ? (
        <View className="gap-3">
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
        </View>
      ) : rows.length ? (
        <Card>
          {rows.map((p, i) => (
            <Row
              key={p.id}
              first={i === 0}
              left={<Avatar name={p.display_name} color={p.avatar_color} uid={p.id} photo={p.photo} />}
              title={p.display_name}
              sub={p.sub}
              accessibilityHint={t('people.chatHint')}
              onPress={() => toChat(p.id)}
              // Everything but this button opens the chat
              right={<IconButton icon="swap" label={t('people.compare', { name: p.display_name })} onPress={() => toCompare(p.id)} />}
              chevron
            />
          ))}
        </Card>
      ) : shown?.kind === 'usual' ? (
        <Text tone="ink2">{t('cal.usualEmpty')}</Text>
      ) : null}
    </Sheet>
  );
});
