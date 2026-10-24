import * as Crypto from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useChat, useMe, useMessages, useOlderMessages, useReadChat, useSendMessage, useToday } from '@/api/hooks';
import type { ChatDetail, ChatMessage } from '@/api/types';
import { ChatInfoSheet } from '@/components/chat/ChatInfoSheet';
import { MessageSheet } from '@/components/chat/MessageSheet';
import { Avatar } from '@/components/ui/Bits';
import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Empty, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { clock, dayLabel, eventText, type Outgoing } from '@/lib/chat';
import { cn } from '@/lib/cn';
import { statusLine } from '@/lib/status';
import { isoDay } from '@/lib/time';

type Item =
  | { type: 'day'; key: string; label: string }
  | { type: 'msg'; key: string; m: ChatMessage; who: boolean; meta: string | null }
  | { type: 'out'; key: string; o: Outgoing };

/**
 * One conversation. Newest at the bottom, scroll up for older ones. Your messages blue on the right, theirs on the
 * left (with a name in groups), events in the middle ("Lotte en Amir pakken samen pauze om 12:30", yellow for
 * breaks). On bad wifi a message shows "Versturen…" and, if it didn't go, "Tik om opnieuw te proberen" (sent once,
 * however often you tap: same Idempotency-Key). Long press: copy, report, block, take back.
 */
export default function ChatScreen() {
  const { t, lang } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = Number(id);
  const me = useMe();
  const chat = useChat(chatId);
  const page = useMessages(chatId);
  const older = useOlderMessages(chatId);
  const send = useSendMessage(chatId);
  const read = useReadChat(chatId);
  const today = useToday();
  const [text, setText] = useState('');
  const [outbox, setOutbox] = useState<(Outgoing & { after: number })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ChatMessage | null>(null);
  const [info, setInfo] = useState(false);
  const insets = useSafeAreaInsets();
  const ink = useCSSVariable('--color-ink');
  const placeholder = useCSSVariable('--color-ink-3');
  const myId = me.data?.id;
  const c = chat.data;
  const messages = page.data?.messages ?? [];
  const lastId = messages.at(-1)?.id ?? 0;

  // Seen: everything up to the newest message (once per new message)
  const told = useRef(0);
  useEffect(() => {
    if (lastId && lastId > told.current && c) {
      told.current = lastId;
      read.mutate(lastId);
    }
  }, [lastId, c?.id]);

  const items = useMemo(() => build(messages, outbox, c, myId, t, lang), [messages, outbox, c, myId, lang]);

  const gone = (chat.error instanceof ApiError && chat.error.status === 404) || (page.error instanceof ApiError && page.error.status === 404);
  if (gone) {
    return (
      <Screen back>
        <Empty title={t('chat.gone')} body={t('chat.goneBody')} mood="sleepy" />
      </Screen>
    );
  }

  const people = c?.people.filter((p) => !p.me) ?? [];
  const free = people.filter((p) => {
    const s = today.data?.board.find((b) => b.id === p.id)?.status;
    return s ? statusLine(s, t).free : false;
  }).length;
  const sub = c?.kind === 'group' ? [t('chat.members', { n: c.count }), free ? t('chat.freeNow', { n: free }) : null].filter(Boolean).join(' · ') : free ? t('chat.isFree') : undefined;

  async function deliver(o: Outgoing) {
    setOutbox((all) => all.map((x) => (x.key === o.key ? { ...x, state: 'sending' } : x)));
    setError(null);
    try {
      await send.mutateAsync({ body: o.body, key: o.key });
      setOutbox((all) => all.filter((x) => x.key !== o.key));
    } catch (e) {
      // Refused (too long, not friends any more…): say why; no network: it stays, tap to try again
      if (e instanceof ApiError && e.status < 500) setError(e.message);
      setOutbox((all) => all.map((x) => (x.key === o.key ? { ...x, state: 'failed' } : x)));
    }
  }

  function submit() {
    const body = text.trim();
    if (!body) return;
    const o = { key: Crypto.randomUUID(), body, state: 'sending' as const, after: lastId };
    setOutbox((all) => [...all, o]);
    setText('');
    deliver(o);
  }

  return (
    <Screen
      back
      navTitle={c?.name ?? ''}
      navSub={sub}
      navRight={<IconButton icon="more" label={t('chat.info')} onPress={() => setInfo(true)} disabled={!c} />}
      scroll={false}
      contentClassName="flex-1 px-0 pb-0 gap-0"
    >
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 52}>
        <FlatList
          className="flex-1 border-t border-line"
          inverted
          data={items}
          keyExtractor={(i) => i.key}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onEndReachedThreshold={0.3}
          onEndReached={() => page.data?.more && !older.isPending && messages[0] && older.mutate(messages[0].id)}
          ListEmptyComponent={
            page.isSuccess ? (
              <Text tone="ink2" className="text-center py-10">
                {t('chat.empty')}
              </Text>
            ) : null
          }
          renderItem={({ item }) => <Bubble item={item} c={c} myId={myId} onLong={setPicked} onRetry={deliver} t={t} />}
        />
        {error ? (
          <Text variant="sm" bold tone="danger" className="px-4 pb-1" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <View className="flex-row items-end gap-2 px-3 pt-2 border-t border-line bg-surface" style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('chat.placeholder')}
            accessibilityLabel={t('chat.placeholder')}
            placeholderTextColor={String(placeholder ?? '#6E6A62')}
            multiline
            // Web: one line to start with (a textarea is two), growing as you type
            numberOfLines={Platform.OS === 'web' ? 1 : undefined}
            maxLength={1000}
            className="flex-1 min-h-11 max-h-32 rounded-[22px] border-[1.5px] border-control-off bg-surface px-4 py-2.5 text-base font-ui"
            style={{ color: String(ink ?? '#161F2A') }}
            onSubmitEditing={Platform.OS === 'web' ? submit : undefined}
            submitBehavior={Platform.OS === 'web' ? 'submit' : undefined}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
            disabled={!text.trim() || !c}
            onPress={submit}
            className={cn('w-11 h-11 rounded-full items-center justify-center bg-you', (!text.trim() || !c) && 'opacity-40')}
          >
            <Icon name="send" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      {c ? <MessageSheet message={picked} chat={c} myId={myId} onClose={() => setPicked(null)} /> : null}
      {c ? <ChatInfoSheet visible={info} chat={c} onClose={() => setInfo(false)} /> : null}
    </Screen>
  );
}

type T = ReturnType<typeof useT>['t'];

/** Oldest to newest with a day line above each new day, then turned around for the inverted list. */
function build(messages: ChatMessage[], outbox: (Outgoing & { after: number })[], c: ChatDetail | undefined, myId: number | undefined, t: T, lang: 'nl' | 'en'): Item[] {
  const out: Item[] = [];
  let day = '';
  let prev: ChatMessage | null = null;
  // "gelezen": under your newest message the others have seen
  const mine = messages.filter((m) => m.user_id === myId && m.kind === 'text');
  const others = c?.people.filter((p) => !p.me) ?? [];
  const lastMine = mine.at(-1);
  for (const m of messages) {
    const d = isoDay(new Date(m.created_at));
    if (d !== day) {
      day = d;
      prev = null;
      out.push({ type: 'day', key: `d${d}`, label: dayLabel(m.created_at, t, lang) });
    }
    const who = c?.kind === 'group' && m.kind === 'text' && m.user_id !== myId && (prev?.user_id !== m.user_id || prev?.kind !== 'text');
    let meta: string | null = m.kind === 'text' ? clock(m.created_at) : null;
    if (m === lastMine && others.length) {
      const seen = others.filter((p) => p.last_read_id >= m.id).length;
      if (seen) meta = `${meta} · ${c?.kind === 'group' ? t('chat.seenBy', { n: seen }) : t('chat.seen')}`;
    }
    out.push({ type: 'msg', key: `m${m.id}`, m, who, meta });
    prev = m;
  }
  // Still on its way (hidden once the server's copy is in, should the answer have been lost)
  for (const o of outbox) {
    if (messages.some((m) => m.id > o.after && m.user_id === myId && m.body === o.body)) continue;
    out.push({ type: 'out', key: `o${o.key}`, o });
  }
  return out.reverse();
}

function Bubble({ item, c, myId, onLong, onRetry, t }: { item: Item; c: ChatDetail | undefined; myId: number | undefined; onLong: (m: ChatMessage) => void; onRetry: (o: Outgoing) => void; t: T }) {
  if (item.type === 'day') {
    return (
      <Text variant="sm" bold tone="ink2" className="self-center py-1">
        {item.label}
      </Text>
    );
  }
  if (item.type === 'out') {
    const failed = item.o.state === 'failed';
    return (
      <View className="self-end max-w-[78%] items-end gap-0.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={failed ? t('chat.failedLabel', { text: item.o.body }) : item.o.body}
          disabled={!failed}
          onPress={() => onRetry(item.o)}
          className={cn('rounded-[16px] rounded-tr-[4px] px-3 py-2', failed ? 'bg-surface border-[1.5px] border-danger' : 'bg-you opacity-80')}
        >
          {failed ? (
            <View className="absolute -left-2 -top-2 w-[22px] h-[22px] rounded-full bg-danger-strong border-2 border-bg items-center justify-center">
              <Text bold className="text-white" style={{ fontSize: 13, lineHeight: 16 }}>
                !
              </Text>
            </View>
          ) : null}
          <Text tone={failed ? 'ink' : 'onYou'}>{item.o.body}</Text>
        </Pressable>
        <Text variant="xs" bold={failed} tone={failed ? 'danger' : 'ink3'} className="px-1">
          {failed ? t('chat.tapRetry') : t('chat.sending')}
        </Text>
      </View>
    );
  }
  const m = item.m;
  if (m.kind === 'event' && m.payload) {
    const together = m.payload.type === 'break_planned';
    return (
      <View className={cn('self-center max-w-[90%] flex-row items-center gap-1.5 px-2.5 py-1 rounded-full', together ? 'bg-together' : 'border border-dashed border-line-strong')}>
        {together ? <Icon name="coffee" size={14} color="on-together" strokeWidth={2} /> : null}
        <Text variant="sm" bold tone={together ? 'onTogether' : 'ink2'} className="text-center">
          {eventText(m.payload, myId, t)}
        </Text>
      </View>
    );
  }
  const mine = m.user_id === myId;
  const author = c?.people.find((p) => p.id === m.user_id);
  const gone = m.deleted || m.removed;
  return (
    <View className={cn('max-w-[78%] gap-0.5', mine ? 'self-end items-end' : 'self-start')}>
      {item.who && author ? (
        <View className="flex-row items-center gap-1.5 pl-0.5">
          <Avatar name={author.display_name} color={author.avatar_color} size="xs" />
          <Text variant="sm" bold tone="ink2">
            {author.display_name}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityHint={gone ? undefined : t('chat.longHint')}
        delayLongPress={350}
        disabled={gone}
        onLongPress={() => onLong(m)}
        className={cn(
          'px-3 py-2',
          mine ? 'rounded-[16px] rounded-tr-[4px] bg-you' : 'rounded-[16px] rounded-tl-[4px] bg-surface border border-line',
          gone && 'bg-transparent border border-dashed border-line-strong',
        )}
      >
        <Text tone={gone ? 'ink3' : mine ? 'onYou' : 'ink'} className={gone ? 'italic' : undefined} selectable={!gone && Platform.OS === 'web'}>
          {gone ? t(m.removed ? 'chat.removed' : 'chat.deleted') : m.body}
        </Text>
      </Pressable>
      {item.meta ? (
        <Text variant="xs" tone="ink3" className="px-1">
          {item.meta}
        </Text>
      ) : null}
    </View>
  );
}
