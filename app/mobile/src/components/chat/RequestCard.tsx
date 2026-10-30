import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAnswerAccess, useAnswerBreak } from '@/api/hooks';
import type { AccessRequest, BreakRequest, ChatMessage } from '@/api/types';
import { AvatarStack, Tag } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { type Key, useT } from '@/i18n';
import { dayWord, howText } from '@/lib/breaks';
import { requestText } from '@/lib/chat';
import { joinNames } from '@/lib/status';
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
 * A break or access request as a card in the chat: full width, where it was asked in the history (not pinned).
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
function Head({ icon, title, state, ids, t }: { icon: 'coffee' | 'calendar'; title: string; state: State; ids: number[]; t: T }) {
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
  const and = t('common.and');
  // Asked: the others asked with you (a group request; the members include you)
  const others = b.mine ? [] : b.members.filter((p) => p.id !== me);
  const who = b.mine
    ? t('req.youAsked', { names: joinNames(b.members.map((p) => p.display_name), and) })
    : others.length
      ? t('req.asksYouAnd', { name: b.from.display_name, names: joinNames(others.map((p) => p.display_name), and) })
      : t('req.asksYou', { name: b.from.display_name });
  const state = breakState(b);
  const open = b.state !== 'cancelled' && !b.over;
  const impossible = state === IMPOSSIBLE;
  // Everyone in it but you: the avatars and Vergelijk
  const people = b.mine ? b.members : [b.from, ...others];
  const sub = [`${dayWord(b.day, isoDay(new Date()), t, lang)} ${range(b.start, b.end)}`, howText(b, t)].join(' · ');
  return (
    <Card className="self-stretch px-4 pt-3 pb-3.5 gap-2">
      <Head icon="coffee" title={t(b.counter_of ? 'break.counterTitle' : 'break.title')} state={state} ids={people.map((p) => p.id)} t={t} />
      <View className="flex-row items-center gap-3">
        <AvatarStack people={people.map((p) => ({ name: p.display_name, color: p.avatar_color, uid: p.id, photo: p.photo }))} size="sm" />
        <View className="flex-1 min-w-0 gap-0.5">
          <Text bold strike={b.state === 'cancelled'}>
            {who}
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
  const r = m.request;
  if (!r) return null;
  const isBreak = r.type === 'break';
  const state = isBreak ? breakState(r) : accessState(r);
  const title = requestText(m, t, lang);
  const ask = isBreak ? !r.mine && r.my_response === 'pending' : !r.mine && r.status === 'pending';
  const busy = isBreak ? breakAnswer.isPending : accessAnswer.isPending;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${t(state.label)}`}
      accessibilityHint={t('req.toCard')}
      onPress={onPress}
      className="flex-row items-center gap-2 min-h-12 pl-3.5 pr-2 py-1.5 rounded-card border border-line bg-surface-raised active:opacity-80"
      style={{ shadowColor: '#161F2A', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 6 }}
    >
      <Icon name={isBreak ? 'coffee' : 'calendar'} size={16} color="ink-2" strokeWidth={2} />
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
  const what = a.mine
    ? t(full ? 'req.accessMineFull' : 'req.accessMineNoRooms', { name: a.to.display_name })
    : t(full ? 'req.accessFull' : 'req.accessNoRooms', { name: a.from.display_name });
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
