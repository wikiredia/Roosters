import { router } from 'expo-router';
import { memo, useState } from 'react';
import { View } from 'react-native';

import { useOpenDirect, useUsualPartners } from '@/api/hooks';
import type { BreakPerson } from '@/api/types';
import { Avatar } from '@/components/ui/Bits';
import { IconButton } from '@/components/ui/Button';
import { Card, Row } from '@/components/ui/Layout';
import { Skeleton } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { dayWord } from '@/lib/breaks';
import { isoDay, range } from '@/lib/time';

import type { BreakPick } from './BreakSheet';

/** What the sheet lists, for a break on `day` (ISO) from `start` to `end`: the friends free then (a shared break,
 * each with their own window), or the friends you usually take a break with (your own break with nobody). */
export type PeopleTarget = { kind: 'together'; day: string; start: number; end: number; people: BreakPick[] } | { kind: 'usual'; day: string; start: number; end: number } | null;

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
