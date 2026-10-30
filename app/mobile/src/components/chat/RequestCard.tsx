import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAnswerAccess, useAnswerBreak, useAnswerSkip } from '@/api/hooks';
import type { AccessRequest, BreakRequest, ChatMessage, SkipRequest } from '@/api/types';
import { AvatarStack, Tag } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { type Key, useT } from '@/i18n';
import { dayWord, duration, howText } from '@/lib/breaks';
import { requestText } from '@/lib/chat';
import { isoDay, range } from '@/lib/time';

type T = ReturnType<typeof useT>['t'];
type TagKind = 'together' | 'line' | 'bad' | 'neutral';
type State = { kind: TagKind; label: Key; icon?: 'check' };

/** Muted: nothing to do any more (taken back, or its time has passed) */
const CANCELLED: State = { kind: 'neutral', label: 'req.stCancelled' };
const OVER: State = { kind: 'neutral', label: 'req.stOver' };
/** Not over, but someone in it isn't free then any more (`possible: false`): nothing to answer */
const IMPOSSIBLE: State = { kind: 'neutral', label: 'req.stImpossible' };

/**
 * A break or access request or a skip question as a card in the chat: full width, where it was asked in the history (not pinned).
 * Facts, not sentences: the bold line is when (or what), the tag says who asked whom, names only in a group.
 * It always shows the request as it is now (the server sends the live state with the message) and the buttons for
 * that state; top right "Vergelijk" opens Vergelijken with the friends in it. `onOtherTime`: "Ander uur" (the chat
 * opens BreakSheet with a counter).
 */
export function RequestCard({ m, me, onOtherTime }: { m: ChatMessage; me: number | undefined; onOtherTime: (b: BreakRequest) => void }) {
  const { t } = useT();
  const r = m.request;
  if (!r) {
    return (
      <View className="self-stretch rounded-card border border-dashed border-line-strong px-4 py-3">
        <Text variant="sm" tone="ink3" className="italic">
          {t('req.gone')}
        </Text>
      </View>
    );
  }
  if (r.type === 'skip') return <SkipCard s={r} t={t} />;
  return r.type === 'break' ? <BreakCard b={r} me={me} t={t} onOtherTime={onOtherTime} /> : <AccessCard a={r} t={t} />;
}

/** "Vergelijk" in the corner: the friends in the request, never you. */
function Compare({ ids, t }: { ids: number[]; t: T }) {
  return (
    <IconButton
      icon="swap"
      label={t('chat.compare')}
      className="-mr-2 -mt-2"
      color="ink-2"
      onPress={() => router.push({ pathname: '/compare', params: { ids: ids.join(',') } })}
    />
  );
}

/** The eyebrow (icon + what kind of request), the state tag, and Vergelijk on the right. */
function Head({ icon, title, state, ids, t }: { icon: 'coffee' | 'calendar' | 'trash'; title: string; state: State; ids: number[]; t: T }) {
  return (
    <View className="flex-row items-center gap-2">
      <Icon name={icon} size={16} color="ink-2" strokeWidth={2} />
      <Text variant="sm" bold tone="ink2" numberOfLines={1} className="shrink">
        {title}
      </Text>
      <Tag kind={state.kind} icon={state.icon}>
        {t(state.label)}
      </Tag>
      <View className="flex-1" />
      <Compare ids={ids} t={t} />
    </View>
  );
}

function breakState(b: BreakRequest): State {
  if (b.state === 'cancelled') return CANCELLED;
  if (b.over) return OVER;
  // Asked: what you said decides; yours: how it stands with the others
  const planned = b.mine ? b.state === 'planned' : b.my_response === 'accepted';
  const declined = b.mine ? b.state === 'declined' : b.my_response === 'declined';
  if (declined) return { kind: 'bad', label: 'break.stDeclined' };
  // Planned or still asked, but it can't happen any more (the server only says so while it's open)
  if (b.possible === false) return IMPOSSIBLE;
  if (planned) return { kind: 'together', label: 'break.stPlanned', icon: 'check' };
  return { kind: 'line', label: b.mine ? 'break.stAsked' : 'break.stTheirs' };
}

function BreakCard({ b, me, t, onOtherTime }: { b: BreakRequest; me: number | undefined; t: T; onOtherTime: (b: BreakRequest) => void }) {
  const { lang } = useT();
  const answer = useAnswerBreak();
  const busy = answer.isPending && answer.variables?.id === b.id;
  const act = (action: 'accepted' | 'declined' | 'cancel') => answer.mutate({ id: b.id, action });
  // Asked: the others asked with you (a group request; the members include you)
  const others = b.mine ? [] : b.members.filter((p) => p.id !== me);
  const state = breakState(b);
  const open = b.state !== 'cancelled' && !b.over;
  const impossible = state === IMPOSSIBLE;
  // Everyone in it but you: the avatars and Vergelijk
  const people = b.mine ? b.members : [b.from, ...others];
  // One other person: a one-to-one chat, where the header, the avatar and the tag already say who asked whom. Only a
  // group request names them: who asked, or whom you asked
  const who =
    people.length < 2
      ? null
      : b.mine
        ? t('req.to', { names: people.map((p) => p.display_name).join(', ') })
        : t('req.fromWith', { name: b.from.display_name, names: others.map((p) => p.display_name).join(', ') });
  const sub = [who, howText(b, t)].filter(Boolean).join(' · ');
  return (
    <Card className="self-stretch px-4 pt-3 pb-3.5 gap-2">
      <Head icon="coffee" title={t(b.counter_of ? 'break.counterTitle' : 'break.title')} state={state} ids={people.map((p) => p.id)} t={t} />
      <View className="flex-row items-center gap-3">
        <AvatarStack people={people.map((p) => ({ name: p.display_name, color: p.avatar_color, uid: p.id, photo: p.photo }))} size="sm" />
        <View className="flex-1 min-w-0 gap-0.5">
          <Text bold strike={b.state === 'cancelled'}>
            {`${dayWord(b.day, isoDay(new Date()), t, lang)} ${range(b.start, b.end)}`}
          </Text>
          <Text variant="sm" tone="ink2">
            {sub}
          </Text>
        </View>
      </View>
      {impossible && b.blocked ? (
        <Text variant="sm" bold tone="ink2">
          {t(b.blocked === 'new_lesson' ? 'req.blockedNewLesson' : 'req.blockedMoved')}
        </Text>
      ) : null}
      {b.note ? (
        <Text variant="sm" tone="ink2" numberOfLines={3}>
          “{b.note}”
        </Text>
      ) : null}
      {impossible ? (
        // Nothing to answer; the asker can still clear it away
        b.mine ? (
          <View className="flex-row pt-1">
            <Button variant="ghost" size="sm" className="px-2" label={t('req.remove')} loading={busy} onPress={() => act('cancel')} />
          </View>
        ) : null
      ) : open ? (
        <View className="flex-row flex-wrap gap-2 pt-1">
          {!b.mine && b.my_response === 'pending' ? (
            <>
              <Button variant="together" size="sm" label={t('break.yes')} accessibilityHint={t('break.canYou')} disabled={busy} loading={busy && answer.variables?.action === 'accepted'} onPress={() => act('accepted')} />
              <Button variant="secondary" size="sm" label={t('break.no')} disabled={busy} loading={busy && answer.variables?.action === 'declined'} onPress={() => act('declined')} />
              <Button variant="ghost" size="sm" label={t('break.otherTime')} disabled={busy} onPress={() => onOtherTime(b)} />
            </>
          ) : !b.mine && b.my_response === 'accepted' ? (
            <Button variant="ghost" size="sm" className="px-2" label={t('break.notAnymore')} loading={busy} onPress={() => act('declined')} />
          ) : b.mine ? (
            <Button variant="ghost" size="sm" className="px-2" label={t(b.state === 'declined' ? 'req.remove' : 'req.takeBack')} loading={busy} onPress={() => act('cancel')} />
          ) : null}
        </View>
      ) : null}
      {answer.error && answer.variables?.id === b.id ? (
        <Text variant="sm" bold tone="danger">
          {answer.error.message}
        </Text>
      ) : null}
    </Card>
  );
}

/** Still going: a break request pending or planned (not over, taken back, declined or impossible), an access request
 * waiting for an answer. The chat pins the newest one at the top while it's scrolled out of view. */
export function isActiveRequest(m: ChatMessage) {
  const r = m.request;
  if (!r) return false;
  if (r.type === 'access') return r.status === 'pending';
  if (r.type === 'skip') return skipState(r).label === 'break.stAsked' || skipState(r).label === 'break.stTheirs';
  const s = breakState(r);
  return s.label === 'break.stPlanned' || s.label === 'break.stAsked' || s.label === 'break.stTheirs';
}

/**
 * The compact copy of an active request card, pinned at the top of the chat while the card is scrolled up out of
 * view: one line with what it is ("Pauze samen? morgen 12:30"), its state and the main answer when it's yours to
 * give (Ja, Aanvaarden), else an arrow. Tapping it scrolls to the card (`onPress`).
 */
export function RequestBar({ m, onPress }: { m: ChatMessage; onPress: () => void }) {
  const { t, lang } = useT();
  const breakAnswer = useAnswerBreak();
  const accessAnswer = useAnswerAccess();
  const skipAnswer = useAnswerSkip();
  const r = m.request;
  if (!r) return null;
  const isBreak = r.type === 'break';
  const state = r.type === 'break' ? breakState(r) : r.type === 'skip' ? skipState(r) : accessState(r);
  const title = requestText(m, t, lang);
  const ask = r.type === 'break' ? !r.mine && r.my_response === 'pending' : !r.mine && state.label === 'break.stTheirs';
  const busy = isBreak ? breakAnswer.isPending : r.type === 'skip' ? skipAnswer.isPending : accessAnswer.isPending;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${t(state.label)}`}
      accessibilityHint={t('req.toCard')}
      onPress={onPress}
      className="flex-row items-center gap-2 min-h-12 pl-3.5 pr-2 py-1.5 rounded-card border border-line bg-surface-raised active:opacity-80"
      style={{ shadowColor: '#161F2A', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 6 }}
    >
      <Icon name={isBreak ? 'coffee' : r.type === 'skip' ? 'trash' : 'calendar'} size={16} color="ink-2" strokeWidth={2} />
      <Text variant="sm" bold numberOfLines={1} className="shrink">
        {title}
      </Text>
      <Tag kind={state.kind} icon={state.icon}>
        {t(state.label)}
      </Tag>
      <View className="flex-1" />
      {ask ? (
        isBreak ? (
          <Button variant="together" size="sm" label={t('break.yes')} loading={busy} onPress={() => breakAnswer.mutate({ id: r.id, action: 'accepted' })} />
        ) : r.type === 'skip' ? (
          <Button variant="together" size="sm" label={t('req.skipYes')} loading={busy} onPress={() => skipAnswer.mutate({ id: r.id, action: 'accept' })} />
        ) : (
          <Button size="sm" label={t('req.accept')} loading={busy} onPress={() => accessAnswer.mutate({ id: r.id, action: 'accept' })} />
        )
      ) : (
        <Icon name="forward" size={18} color="ink-3" strokeWidth={2} />
      )}
    </Pressable>
  );
}

function accessState(a: AccessRequest): State {
  if (a.status === 'accepted') return { kind: 'together', label: 'req.stAccepted', icon: 'check' };
  if (a.status === 'declined') return { kind: 'bad', label: 'req.stRefused' };
  if (a.status === 'cancelled') return CANCELLED;
  return { kind: 'line', label: a.mine ? 'break.stAsked' : 'break.stTheirs' };
}

function AccessCard({ a, t }: { a: AccessRequest; t: T }) {
  const answer = useAnswerAccess();
  const busy = answer.isPending && answer.variables?.id === a.id;
  const other = a.mine ? a.to : a.from;
  const full = a.visibility === 'full';
  // Always in your one-to-one chat: the tag says who asked, the card only what for
  const what = t(full ? 'req.accessWhatFull' : 'req.accessWhatNoRooms');
  const state = accessState(a);
  return (
    <Card className="self-stretch px-4 pt-3 pb-3.5 gap-2">
      <Head icon="calendar" title={t('req.accessTitle')} state={state} ids={[other.id]} t={t} />
      <View className="flex-row items-center gap-3">
        <AvatarStack people={[{ name: other.display_name, color: other.avatar_color, uid: other.id, photo: other.photo }]} size="sm" />
        <Text bold className="flex-1 min-w-0" strike={a.status === 'cancelled'}>
          {what}
        </Text>
      </View>
      {a.status === 'pending' ? (
        <View className="flex-row flex-wrap gap-2 pt-1">
          {a.mine ? (
            <Button variant="ghost" size="sm" className="px-2" label={t('req.takeBack')} loading={busy} onPress={() => answer.mutate({ id: a.id, action: 'cancel' })} />
          ) : (
            <>
              <Button size="sm" label={t('req.accept')} disabled={busy} loading={busy && answer.variables?.action === 'accept'} onPress={() => answer.mutate({ id: a.id, action: 'accept' })} />
              <Button variant="secondary" size="sm" label={t('req.decline')} disabled={busy} loading={busy && answer.variables?.action === 'decline'} onPress={() => answer.mutate({ id: a.id, action: 'decline' })} />
            </>
          )}
        </View>
      ) : null}
      {answer.error && answer.variables?.id === a.id ? (
        <Text variant="sm" bold tone="danger">
          {answer.error.message}
        </Text>
      ) : null}
    </Card>
  );
}

/** A skip question: open until answered or its day is over; a yes is a break together. */
function skipState(s: SkipRequest): State {
  if (s.status === 'accepted') return { kind: 'together', label: 'req.stSkipped', icon: 'check' };
  if (s.status === 'declined') return { kind: 'bad', label: 'req.stGoing' };
  if (s.status === 'cancelled') return CANCELLED;
  if (s.day < isoDay(new Date())) return OVER;
  return { kind: 'line', label: s.mine ? 'break.stAsked' : 'break.stTheirs' };
}

/**
 * "Volg je Python?": a friend asks whether you'd skip a class, because then you'd share a break. The one asked gets
 * Ja, ik skip (it becomes their own skip, their timetable changes) and Nee, ik ga; the asker can take it back. The
 * course only shows when the server sends it (the asker sees it only when the friend shows their courses).
 */
function SkipCard({ s, t }: { s: SkipRequest; t: T }) {
  const { lang } = useT();
  const answer = useAnswerSkip();
  const busy = answer.isPending && answer.variables?.id === s.id;
  const other = s.mine ? s.to : s.from;
  const when = `${dayWord(s.day, isoDay(new Date()), t, lang)} ${range(s.start, s.end)}`;
  const course = s.course ?? t('req.skipClass');
  // Their question names the course in the head already; yours ("Skip je die les?") says it here
  const what = s.mine && s.course ? `${s.course} · ${when}` : when;
  const state = skipState(s);
  const open = state.label === 'break.stAsked' || state.label === 'break.stTheirs';
  return (
    <Card className="self-stretch px-4 pt-3 pb-3.5 gap-2">
      <Head icon="trash" title={s.mine ? t('req.skipTitleMine') : t('req.skipTitle', { course })} state={state} ids={[other.id]} t={t} />
      <View className="flex-row items-center gap-3">
        <AvatarStack people={[{ name: other.display_name, color: other.avatar_color, uid: other.id, photo: other.photo }]} size="sm" />
        <View className="flex-1 min-w-0 gap-0.5">
          <Text bold strike={s.status === 'cancelled'}>
            {what}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Icon name="together" size={15} color="together-ink" strokeWidth={2} />
            <Text variant="sm" bold tone="together">
              {t('req.skipGain', { dur: duration(s.minutes, t) })}
            </Text>
          </View>
        </View>
      </View>
      {open ? (
        <View className="flex-row flex-wrap gap-2 pt-1">
          {s.mine ? (
            <Button variant="ghost" size="sm" className="px-2" label={t('req.takeBack')} loading={busy} onPress={() => answer.mutate({ id: s.id, action: 'cancel' })} />
          ) : (
            <>
              <Button variant="together" size="sm" label={t('req.skipYes')} disabled={busy} loading={busy && answer.variables?.action === 'accept'} onPress={() => answer.mutate({ id: s.id, action: 'accept' })} />
              <Button variant="secondary" size="sm" label={t('req.skipNo')} disabled={busy} loading={busy && answer.variables?.action === 'decline'} onPress={() => answer.mutate({ id: s.id, action: 'decline' })} />
            </>
          )}
        </View>
      ) : null}
      {answer.error && answer.variables?.id === s.id ? (
        <Text variant="sm" bold tone="danger">
          {answer.error.message}
        </Text>
      ) : null}
    </Card>
  );
}
