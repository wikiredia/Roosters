import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useAnswerBreak, useAskBreak } from '@/api/hooks';
import type { BreakMode, BreakRequest } from '@/api/types';
import { AvatarStack, Chip, Segmented } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Inputs';
import { Card, Row } from '@/components/ui/Layout';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { breakError, dayWord } from '@/lib/breaks';
import { joinNames } from '@/lib/status';
import { hhmm, isoDay, range } from '@/lib/time';

const STEP = 5;
/** "Ander uur" may go anywhere in the school day */
const DAY_SPAN: [number, number] = [7 * 60, 22 * 60];

export type BreakPick = { id: number; display_name: string; avatar_color: number; start: number; end: number };

/** What the sheet is for: asking for a shared break (the people in it, each with their own free window), or
 * proposing another time for a request you got. */
export type BreakTarget = { kind: 'ask'; day: string; people: BreakPick[] } | { kind: 'counter'; request: BreakRequest } | null;

/**
 * "Pauze samen?": tap a shared break (Today, Rooster) and ask to spend it together. Who (when you share it with
 * several friends), how (I come to you, you come to me, meet at a place), from–until (the whole break by default,
 * in steps of 5 minutes, within the break) and a short note. "Ander uur" uses the same sheet for a counter-proposal:
 * any time that day. The server checks that everyone is free and nobody was asked already; what's wrong shows here.
 */
export function BreakSheet({ target, onClose }: { target: BreakTarget; onClose: () => void }) {
  const { t } = useT();
  // Keep showing the last target while the sheet slides away
  const [last, setLast] = useState(target);
  if (target && target !== last) setLast(target);
  const shown = target ?? last;
  const counter = shown?.kind === 'counter';
  return (
    <Sheet
      visible={!!target}
      onClose={onClose}
      closeLabel={t('common.close')}
      title={counter ? t('break.counterTitle') : t('break.title')}
      sub={shown?.kind === 'counter' ? t('break.counterSub', { name: shown.request.from.display_name }) : undefined}
    >
      {/* A new target starts a fresh form */}
      {shown ? <Form key={shown.kind === 'ask' ? `${shown.day}:${shown.people.map((p) => `${p.id}@${p.start}`).join()}` : `c${shown.request.id}`} target={shown} onDone={onClose} /> : null}
    </Sheet>
  );
}

function Form({ target, onDone }: { target: NonNullable<BreakTarget>; onDone: () => void }) {
  const { t, lang } = useT();
  const ask = useAskBreak();
  const answer = useAnswerBreak();
  const people = target.kind === 'ask' ? target.people : [];
  const [chosen, setChosen] = useState<number[]>(people.map((p) => p.id));
  const window = (ids: number[]): [number, number] => {
    const ps = people.filter((p) => ids.includes(p.id));
    return ps.length ? [Math.max(...ps.map((p) => p.start)), Math.min(...ps.map((p) => p.end))] : [0, 0];
  };
  const r = target.kind === 'counter' ? target.request : null;
  // Bounds: the whole shared break (everyone's windows together); another time: the school day
  const bounds: [number, number] = r ? DAY_SPAN : [Math.min(...people.map((p) => p.start)), Math.max(...people.map((p) => p.end))];
  const first = r ? [r.start, r.end] : window(chosen);
  const [start, setStart] = useState(first[1] > first[0] ? first[0] : bounds[0]);
  const [end, setEnd] = useState(first[1] > first[0] ? first[1] : bounds[1]);
  const [mode, setMode] = useState<BreakMode>('meet');
  const [place, setPlace] = useState(r?.place ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const day = target.kind === 'ask' ? target.day : target.request.day;
  const busy = ask.isPending || answer.isPending;
  const names = new Map((r ? [r.from] : people).map((p) => [p.id, p.display_name]));

  function toggle(id: number) {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    if (!next.length) return;
    setChosen(next);
    // The time everyone you picked is free
    const [a, b] = window(next);
    if (b - a >= STEP) {
      setStart(a);
      setEnd(b);
    }
    setError(null);
  }

  async function send() {
    setError(null);
    try {
      if (r) await answer.mutateAsync({ id: r.id, action: 'counter', start, end, place: place.trim() || null, note: note.trim() || null });
      else await ask.mutateAsync({ to_ids: chosen, day, start, end, mode, place: mode === 'meet' ? place.trim() || null : null, note: note.trim() || null });
      onDone();
    } catch (e) {
      setError(breakError(e, names, t));
    }
  }

  const who = people.filter((p) => chosen.includes(p.id));
  return (
    <>
      <Card>
        <Row
          first
          left={<AvatarStack people={(r ? [r.from] : who).map((p) => ({ name: p.display_name, color: p.avatar_color }))} size="md" ring="together" />}
          title={r ? r.from.display_name : joinNames(who.map((p) => p.display_name), t('common.and'))}
          sub={`${dayWord(day, isoDay(new Date()), t, lang)} · ${range(start, end)}`}
        />
      </Card>
      {people.length > 1 ? (
        <View className="gap-2">
          <Text variant="sm" bold>
            {t('break.with')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {people.map((p) => (
              <Chip key={p.id} label={p.display_name} state={chosen.includes(p.id) ? 'on' : 'default'} icon={chosen.includes(p.id) ? 'check' : undefined} onPress={() => toggle(p.id)} />
            ))}
          </View>
        </View>
      ) : null}
      {!r ? (
        <View className="gap-2">
          <Text variant="sm" bold>
            {t('break.how')}
          </Text>
          <Segmented<BreakMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'i_come', label: t('break.iCome') },
              { value: 'you_come', label: t('break.youCome') },
              { value: 'meet', label: t('break.meet') },
            ]}
          />
        </View>
      ) : null}
      {(r ? r.mode === 'meet' : mode === 'meet') ? <Input label={t('break.place')} placeholder={t('break.placeHint')} value={place} onChangeText={setPlace} maxLength={120} /> : null}
      <Card>
        <TimeRow first label={t('break.from')} value={start} min={bounds[0]} max={end - STEP} onChange={setStart} />
        <TimeRow label={t('break.until')} value={end} min={start + STEP} max={bounds[1]} onChange={setEnd} />
      </Card>
      <Input label={t('break.note')} value={note} onChangeText={setNote} maxLength={200} />
      {error ? (
        <Text variant="sm" bold tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button variant="together" label={r ? t('break.sendCounter') : t('break.send')} icon="together" loading={busy} disabled={busy} onPress={send} />
      {!r ? (
        <Button
          variant="ghost"
          label={t('break.compare')}
          onPress={() => {
            onDone();
            router.push({ pathname: '/compare', params: { ids: chosen.join(',') } });
          }}
        />
      ) : null}
    </>
  );
}

/** "Van 10:30  − +": 5 minutes a tap, within its bounds. */
function TimeRow({ label, value, min, max, onChange, first }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; first?: boolean }) {
  const { t } = useT();
  return (
    // One adjustable control for screen readers; the − and + are for fingers
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label} ${hhmm(value)}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(Math.max(min, Math.min(max, value + (e.nativeEvent.actionName === 'increment' ? STEP : -STEP))))}
    >
      <Row
        first={first}
        title={label}
        right={
          <View className="flex-row items-center gap-1">
            <IconButton icon="minus" label={t('break.earlier')} disabled={value - STEP < min} onPress={() => onChange(value - STEP)} />
            <Text bold className="w-14 text-center">
              {hhmm(value)}
            </Text>
            <IconButton icon="plus" label={t('break.later')} disabled={value + STEP > max} onPress={() => onChange(value + STEP)} />
          </View>
        }
      />
    </View>
  );
}
