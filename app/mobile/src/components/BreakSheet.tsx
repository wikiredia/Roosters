import { useState } from 'react';
import { View } from 'react-native';
import { SlideInLeft, SlideInRight, SlideOutLeft, SlideOutRight } from 'react-native-reanimated';

import { useAnswerBreak, useAskBreak, useBreaks } from '@/api/hooks';
import type { BreakMode, BreakRequest } from '@/api/types';
import { Avatar, AvatarStack, Segmented, Tag } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Inputs';
import { Card, Row } from '@/components/ui/Layout';
import { AView } from '@/components/ui/Motion';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { breakError, dayWord, duration, stateWith, type WithState } from '@/lib/breaks';
import { joinNames } from '@/lib/status';
import { hhmm, isoDay, range } from '@/lib/time';

const STEP = 5;
/** How a friend you already asked (or who asked you) shows in the list; open: you can't ask again now */
const STATE_TAG: Record<WithState, { kind: 'together' | 'line' | 'you' | 'bad'; label: 'break.stPlanned' | 'break.stAsked' | 'break.stTheirs' | 'break.stDeclined'; open: boolean }> = {
  planned: { kind: 'together', label: 'break.stPlanned', open: false },
  asked: { kind: 'line', label: 'break.stAsked', open: false },
  theirs: { kind: 'you', label: 'break.stTheirs', open: false },
  declined: { kind: 'bad', label: 'break.stDeclined', open: true },
};
/** "Ander uur" may go anywhere in the school day */
const DAY_SPAN: [number, number] = [7 * 60, 22 * 60];

export type BreakPick = { id: number; display_name: string; avatar_color: number; photo?: number | null; start: number; end: number };

/** What the sheet is for: asking for a shared break (the people in it, each with their own free window), or
 * proposing another time for a request you got. */
export type BreakTarget = { kind: 'ask'; day: string; people: BreakPick[] } | { kind: 'counter'; request: BreakRequest } | null;

/** The sheet's pages, in order: who (asking only), how and when, a note. */
type Step = 'who' | 'how' | 'note';
const ORDER: Step[] = ['who', 'how', 'note'];

/**
 * "Pauze samen?": tap a shared break (Today, Rooster) and ask to spend it together, in three short pages that
 * slide sideways: who (a row per friend with their free window, even when there's one; "Allemaal" when several
 * are free at the same time), how and when (I come to you, you come to me, meet at a place; from–until in steps
 * of 5 minutes within the break) and a short note. "Ander uur" uses the same sheet for a counter-proposal, from
 * the second page: any time that day. The server checks that everyone is free and nobody was asked already;
 * what's wrong shows on the last page.
 */
export function BreakSheet({ target, onClose }: { target: BreakTarget; onClose: () => void }) {
  const { t, lang } = useT();
  // Keep showing the last target while the sheet slides away; a new one starts on its first page
  const [last, setLast] = useState(target);
  const [step, setStep] = useState<Step>('who');
  const [dir, setDir] = useState<1 | -1>(1);
  if (target && target !== last) {
    setLast(target);
    setStep(target.kind === 'counter' ? 'how' : 'who');
    setDir(1);
  }
  const shown = target ?? last;
  const counter = shown?.kind === 'counter';
  const first: Step = counter ? 'how' : 'who';
  const go = (s: Step) => {
    setDir(ORDER.indexOf(s) > ORDER.indexOf(step) ? 1 : -1);
    setStep(s);
  };
  const day = shown ? (shown.kind === 'ask' ? shown.day : shown.request.day) : '';
  const title = step === 'who' ? t('break.title') : step === 'how' ? (counter ? t('break.counterTitle') : t('break.howTitle')) : t('break.noteTitle');
  const sub =
    step === 'who'
      ? dayWord(day, isoDay(new Date()), t, lang)
      : counter && shown?.kind === 'counter' && step === 'how'
        ? t('break.counterSub', { name: shown.request.from.display_name })
        : undefined;
  return (
    <Sheet
      visible={!!target}
      onClose={onClose}
      closeLabel={t('common.close')}
      title={title}
      sub={sub}
      left={step !== first ? <IconButton icon="back" label={t('common.back')} onPress={() => go(ORDER[ORDER.indexOf(step) - 1])} /> : undefined}
    >
      {/* A new target starts a fresh form */}
      {shown ? (
        <Form
          key={shown.kind === 'ask' ? `${shown.day}:${shown.people.map((p) => `${p.id}@${p.start}`).join()}` : `c${shown.request.id}`}
          target={shown}
          step={step}
          dir={dir}
          go={go}
          onDone={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function Form({ target, step, dir, go, onDone }: { target: NonNullable<BreakTarget>; step: Step; dir: 1 | -1; go: (s: Step) => void; onDone: () => void }) {
  const { t, lang } = useT();
  const ask = useAskBreak();
  const answer = useAnswerBreak();
  const breaks = useBreaks();
  const people = target.kind === 'ask' ? target.people : [];
  // Already asked, planned or asked by them: shown with its state, and not asked twice
  const states = new Map(people.map((p) => [p.id, stateWith(breaks.data, p.id, target.kind === 'ask' ? target.day : '', p.start, p.end)?.state ?? null]));
  const askable = people.filter((p) => {
    const st = states.get(p.id);
    return !st || STATE_TAG[st].open;
  });
  const [chosen, setChosen] = useState<number[]>(people.length === 1 ? [people[0].id] : []);
  const window = (ids: number[]): [number, number] => {
    const ps = people.filter((p) => ids.includes(p.id));
    return ps.length ? [Math.max(...ps.map((p) => p.start)), Math.min(...ps.map((p) => p.end))] : [0, 0];
  };
  const r = target.kind === 'counter' ? target.request : null;
  // Bounds: the whole shared break (everyone's windows together); another time: the school day
  const bounds: [number, number] = r ? DAY_SPAN : [Math.min(...people.map((p) => p.start)), Math.max(...people.map((p) => p.end))];
  const initial = r ? [r.start, r.end] : window(chosen);
  const [start, setStart] = useState(initial[1] > initial[0] ? initial[0] : bounds[0]);
  const [end, setEnd] = useState(initial[1] > initial[0] ? initial[1] : bounds[1]);
  const [mode, setMode] = useState<BreakMode>('meet');
  const [place, setPlace] = useState(r?.place ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const day = target.kind === 'ask' ? target.day : target.request.day;
  const busy = ask.isPending || answer.isPending;
  const names = new Map((r ? [r.from] : people).map((p) => [p.id, p.display_name]));
  // Several friends free at the same time: asking them all at once is one row too
  const together = askable.length > 1 ? window(askable.map((p) => p.id)) : null;
  const all = together && together[1] - together[0] >= STEP ? together : null;

  function pick(ids: number[]) {
    setChosen(ids);
    // The time everyone you picked is free
    const [a, b] = window(ids);
    if (b - a >= STEP) {
      setStart(a);
      setEnd(b);
    }
    setError(null);
    go('how');
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

  const who = r ? [r.from] : people.filter((p) => chosen.includes(p.id));
  const meet = r ? r.mode === 'meet' : mode === 'meet';
  // The page slides in from the side you're going to; the one you leave slides out the other way
  const entering = (dir > 0 ? SlideInRight : SlideInLeft).duration(240);
  const exiting = (dir > 0 ? SlideOutLeft : SlideOutRight).duration(200);
  return (
    <AView key={step} entering={entering} exiting={exiting} className="gap-4">
      {step === 'who' ? (
        <Card>
          {all ? (
            <Row
              first
              left={<AvatarStack people={askable.map((p) => ({ name: p.display_name, color: p.avatar_color, uid: p.id, photo: p.photo }))} size="sm" ring="surface" />}
              title={t('break.everyone', { n: askable.length })}
              sub={range(all[0], all[1])}
              right={<Text variant="sm" bold tone="ink2">{duration(all[1] - all[0], t)}</Text>}
              chevron
              onPress={() => pick(askable.map((p) => p.id))}
            />
          ) : null}
          {people.map((p, i) => {
            const st = states.get(p.id);
            const tag = st ? STATE_TAG[st] : null;
            const open = !tag || tag.open;
            return (
              <Row
                key={p.id}
                first={!all && i === 0}
                left={<Avatar name={p.display_name} color={p.avatar_color} uid={p.id} photo={p.photo} />}
                title={p.display_name}
                sub={`${range(p.start, p.end)} · ${duration(p.end - p.start, t)}`}
                right={tag ? <Tag kind={tag.kind}>{t(tag.label)}</Tag> : undefined}
                chevron={open}
                accessibilityLabel={[p.display_name, range(p.start, p.end), duration(p.end - p.start, t), tag ? t(tag.label) : null].filter(Boolean).join(', ')}
                onPress={open ? () => pick([p.id]) : undefined}
              />
            );
          })}
        </Card>
      ) : null}

      {step === 'how' ? (
        <>
          <Summary who={who} day={day} start={start} end={end} t={t} lang={lang} />
          {!r ? (
            <Segmented<BreakMode>
              value={mode}
              onChange={setMode}
              options={[
                { value: 'i_come', label: t('break.iCome') },
                { value: 'you_come', label: t('break.youCome') },
                { value: 'meet', label: t('break.meet') },
              ]}
            />
          ) : null}
          {meet ? <Input label={t('break.place')} placeholder={t('break.placeHint')} value={place} onChangeText={setPlace} maxLength={120} /> : null}
          <Card>
            <TimeRow first label={t('break.from')} value={start} min={bounds[0]} max={end - STEP} onChange={setStart} />
            <TimeRow label={t('break.until')} value={end} min={start + STEP} max={bounds[1]} onChange={setEnd} />
          </Card>
          <Button label={t('common.next')} icon="forward" onPress={() => go('note')} />
        </>
      ) : null}

      {step === 'note' ? (
        <>
          <Summary who={who} day={day} start={start} end={end} t={t} lang={lang} />
          <Input label={t('break.note')} value={note} onChangeText={setNote} maxLength={200} multiline />
          {error ? (
            <Text variant="sm" bold tone="danger" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button variant="together" label={r ? t('break.sendCounter') : t('break.send')} icon="together" loading={busy} disabled={busy} onPress={send} />
        </>
      ) : null}
    </AView>
  );
}

type T = ReturnType<typeof useT>['t'];

/** Who, which day, from–until: on top of the second and third page. */
function Summary({ who, day, start, end, t, lang }: { who: { id: number; display_name: string; avatar_color: number; photo?: number | null }[]; day: string; start: number; end: number; t: T; lang: 'nl' | 'en' }) {
  return (
    <Card>
      <Row
        first
        left={<AvatarStack people={who.map((p) => ({ name: p.display_name, color: p.avatar_color, uid: p.id, photo: p.photo }))} size="md" ring="together" />}
        title={joinNames(who.map((p) => p.display_name), t('common.and'))}
        sub={`${dayWord(day, isoDay(new Date()), t, lang)} · ${range(start, end)}`}
      />
    </Card>
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
