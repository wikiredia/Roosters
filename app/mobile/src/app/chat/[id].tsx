import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, useWindowDimensions, View } from 'react-native';
import { FadeInDown, FadeOut, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useBlock, useChat, useMe, useMessages, useOlderMessages, useReadChat, useSendMessage, useToday } from '@/api/hooks';
import type { ChatDetail, ChatMessage } from '@/api/types';
import { ChatInfoSheet } from '@/components/chat/ChatInfoSheet';
import { liftBy, MessageSheet, type Rect } from '@/components/chat/MessageSheet';
import { Avatar, AvatarStack, Tag } from '@/components/ui/Bits';
import { IconButton } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { AView } from '@/components/ui/Motion';
import { Empty, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { clock, dayLabel, eventText, type Outgoing } from '@/lib/chat';
import { cn } from '@/lib/cn';
import { confirm } from '@/lib/confirm';
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
 * however often you tap: same Idempotency-Key). On top: their photo and name (tap: their page; a group: its info).
 * Long press a message: copy, report, block, take back; the chat slides up with the sheet and the message stays
 * bright above it. The + left of the box: camera and files (soon), compare timetables, report, block.
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
  const [picked, setPicked] = useState<{ m: ChatMessage; rect: Rect | null } | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [info, setInfo] = useState(false);
  const [menu, setMenu] = useState(false);
  const [barH, setBarH] = useState(60);
  const block = useBlock();
  const insets = useSafeAreaInsets();
  const screenH = useWindowDimensions().height;
  // The message sheet's slide, shared: the chat moves up with it so the message you picked stays above the sheet
  const sheetProgress = useSharedValue(0);
  const sheetH = useSharedValue(400);
  const rect = useSharedValue<Rect | null>(null);
  // Under the header (the photo row and the name under it)
  const minTop = insets.top + 96;
  const liftY = useDerivedValue(() => liftBy(rect.get(), sheetH.get(), screenH, minTop) * sheetProgress.get());
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: liftY.get() }] }));
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
  // What was there when the chat opened stays still; what comes in after (yours as you send it, theirs as it
  // arrives) slides up into place
  const opened = useRef<number | null>(null);
  if (opened.current === null && page.data) opened.current = lastId;
  const fresh = (i: Item) => i.type === 'out' || (i.type === 'msg' && opened.current !== null && i.m.id > opened.current && i.m.user_id !== myId);

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

  const other = c?.kind === 'direct' ? people[0] : undefined;
  // Their newest message: what "Melden" from the + reports (a group: long press the message itself)
  const theirLast = other ? [...messages].reverse().find((m) => m.user_id === other.id && m.kind === 'text' && !m.deleted && !m.removed) : undefined;

  const openPerson = () => (other ? router.push(`/friends/${other.id}`) : setInfo(true));

  function longPress(m: ChatMessage, r: Rect | null) {
    rect.set(r);
    setPicked({ m, rect: r });
  }

  async function onBlock() {
    if (!other) return;
    const name = other.display_name;
    if (!(await confirm(t('friend.blockConfirm', { name }), t('chat.blockSub', { name }), t('friend.block', { name }), t('common.cancel')))) return;
    await block.mutateAsync(other.id);
    router.back();
  }

  const menuItems: { icon: IconName; label: string; soon?: boolean; danger?: boolean; onPress?: () => void }[] = [
    { icon: 'camera', label: t('chat.camera'), soon: true },
    { icon: 'file', label: t('chat.files'), soon: true },
    {
      icon: 'swap',
      label: t('chat.compare'),
      // Everyone in it who's your friend (more than 3 is Premium: Vergelijken says so)
      onPress: () => router.push({ pathname: '/compare', params: { ids: people.filter((p) => p.friend).map((p) => p.id).join(',') } }),
    },
    ...(other
      ? [
          ...(theirLast ? [{ icon: 'flag' as const, label: t('chat.reportPerson', { name: other.display_name }), onPress: () => setReporting(theirLast) }] : []),
          { icon: 'block' as const, label: t('friend.block', { name: other.display_name }), danger: true, onPress: onBlock },
        ]
      : []),
  ];

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
      navCenter={
        c ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={c.name ?? ''}
            accessibilityHint={other ? t('chat.openProfile') : t('chat.info')}
            onPress={openPerson}
            className="active:opacity-70"
          >
            {other ? (
              <Avatar name={other.display_name} color={other.avatar_color} uid={other.id} photo={other.photo} size="md" />
            ) : (
              <AvatarStack people={people.slice(0, 3).map((p) => ({ name: p.display_name, color: p.avatar_color, uid: p.id, photo: p.photo }))} size="sm" />
            )}
          </Pressable>
        ) : undefined
      }
      navBelow={
        c ? (
          // The name under the photo; tapping it does the same (screen readers have the photo's button)
          <Pressable onPress={openPerson} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="items-center active:opacity-70">
            <Text variant="sm" bold numberOfLines={1}>
              {c.name ?? ''}
            </Text>
            {sub ? (
              <Text variant="xs" tone="ink2" numberOfLines={1}>
                {sub}
              </Text>
            ) : null}
          </Pressable>
        ) : undefined
      }
      navRight={<IconButton icon="more" label={t('chat.info')} onPress={() => setInfo(true)} disabled={!c} />}
      scroll={false}
      contentClassName="flex-1 px-0 pb-0 gap-0"
    >
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 52 + 20 + (sub ? 16 : 0)}>
        <AView className="flex-1" style={liftStyle}>
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
            renderItem={({ item }) =>
              fresh(item) ? (
                // The list is upside down: "down" here comes up from the box
                <AView entering={FadeInDown.duration(200)}>
                  <Bubble item={item} c={c} myId={myId} onLong={longPress} onRetry={deliver} t={t} />
                </AView>
              ) : (
                <Bubble item={item} c={c} myId={myId} onLong={longPress} onRetry={deliver} t={t} />
              )
            }
          />
          {error ? (
            <Text variant="sm" bold tone="danger" className="px-4 pb-1" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <View
            className="flex-row items-end gap-2 px-3 pt-2 border-t border-line bg-surface"
            style={{ paddingBottom: Math.max(insets.bottom, 10) }}
            onLayout={(e) => setBarH(e.nativeEvent.layout.height)}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('chat.more')}
              accessibilityState={{ expanded: menu }}
              disabled={!c}
              onPress={() => setMenu((x) => !x)}
              className={cn('w-11 h-11 rounded-full items-center justify-center bg-surface-sunken', menu && 'bg-ink')}
            >
              <Icon name={menu ? 'close' : 'plus'} size={22} color={menu ? 'ink-inverse' : 'ink'} strokeWidth={2} />
            </Pressable>
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
          {menu ? (
            <>
              {/* A tap anywhere else closes it */}
              <Pressable accessibilityLabel={t('common.close')} onPress={() => setMenu(false)} className="absolute inset-0" />
              <AView entering={FadeInDown.duration(160)} exiting={FadeOut.duration(120)} className="absolute left-3 w-64" style={{ bottom: barH + 8 }}>
                <View
                  className="bg-surface-raised rounded-card border border-line overflow-hidden"
                  style={{ shadowColor: '#161F2A', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 10 }}
                >
                  {menuItems.map((it, i) => (
                    <Pressable
                      key={it.label}
                      accessibilityRole="button"
                      accessibilityLabel={it.label}
                      accessibilityState={{ disabled: it.soon }}
                      disabled={it.soon}
                      onPress={() => {
                        setMenu(false);
                        it.onPress?.();
                      }}
                      className={cn('flex-row items-center gap-3 px-4 min-h-12 active:bg-surface-sunken', i > 0 && 'border-t border-line')}
                    >
                      <Icon name={it.icon} size={20} color={it.danger ? 'danger-ink' : it.soon ? 'ink-3' : 'ink'} />
                      <Text bold tone={it.danger ? 'danger' : it.soon ? 'ink3' : 'ink'} className="flex-1" numberOfLines={1}>
                        {it.label}
                      </Text>
                      {it.soon ? <Tag>{t('common.soon')}</Tag> : null}
                    </Pressable>
                  ))}
                </View>
              </AView>
            </>
          ) : null}
        </AView>
      </KeyboardAvoidingView>
      {c ? (
        <MessageSheet
          message={picked?.m ?? null}
          chat={c}
          myId={myId}
          onClose={() => setPicked(null)}
          lift={
            picked?.rect
              ? { progress: sheetProgress, height: sheetH, y: liftY, rect: picked.rect, copy: <Bubble item={msgItem(picked.m)} c={c} myId={myId} lifted onLong={() => {}} onRetry={() => {}} t={t} /> }
              : null
          }
        />
      ) : null}
      {c ? <MessageSheet message={reporting} chat={c} myId={myId} startAt="report" onClose={() => setReporting(null)} /> : null}
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

const msgItem = (m: ChatMessage): Item => ({ type: 'msg', key: `m${m.id}`, m, who: false, meta: null });

/** One row of the chat. `lifted`: just the bubble, for the copy over the message sheet's scrim. */
function Bubble({ item, c, myId, onLong, onRetry, t, lifted }: { item: Item; c: ChatDetail | undefined; myId: number | undefined; onLong: (m: ChatMessage, r: Rect | null) => void; onRetry: (o: Outgoing) => void; t: T; lifted?: boolean }) {
  const box = useRef<View>(null);
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
  // Where the bubble is, so the sheet can lift it (no position: the sheet shows a copy instead)
  const long = () => {
    if (!box.current) return onLong(m, null);
    box.current.measureInWindow((x, y, w, h) => onLong(m, w ? { x, y, w, h } : null));
  };
  return (
    <View className={cn('gap-0.5', !lifted && 'max-w-[78%]', mine ? 'self-end items-end' : 'self-start')}>
      {item.who && author ? (
        <View className="flex-row items-center gap-1.5 pl-0.5">
          <Avatar name={author.display_name} color={author.avatar_color} uid={author.id} photo={author.photo} size="xs" />
          <Text variant="sm" bold tone="ink2">
            {author.display_name}
          </Text>
        </View>
      ) : null}
      <Pressable
        ref={box}
        accessibilityHint={gone ? undefined : t('chat.longHint')}
        delayLongPress={350}
        disabled={gone || lifted}
        onLongPress={long}
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
