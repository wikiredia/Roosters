import type { Chat, ChatEvent, ChatMessage } from '@/api/types';
import type { Key, Lang } from '@/i18n';

import { joinNames } from './status';
import { addDays, hhmm, isoDay, shortDate, weekdayShort } from './time';

type T = (k: Key, p?: Record<string, string | number>) => string;

/** A message's local time of day, "10:58". */
export function clock(iso: string) {
  const d = new Date(iso);
  return hhmm(d.getHours() * 60 + d.getMinutes());
}

/** In the chat list: "11:20" today, "gisteren", "ma" this week, "di 14 okt" before that. */
export function when(iso: string, t: T, lang: Lang, now = new Date()) {
  const d = new Date(iso);
  const day = isoDay(d);
  if (day === isoDay(now)) return clock(iso);
  if (day === isoDay(addDays(now, -1))) return t('chat.yesterday');
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return weekdayShort(d, lang).toLowerCase();
  return shortDate(d, lang);
}

/** Above the first message of a day in a conversation: "Vandaag", "Gisteren", "di 14 okt". */
export function dayLabel(iso: string, t: T, lang: Lang, now = new Date()) {
  const day = isoDay(new Date(iso));
  if (day === isoDay(now)) return t('today.title');
  if (day === isoDay(addDays(now, -1))) return t('chat.yesterdayCap');
  return shortDate(new Date(iso), lang);
}

/** The sentence for an event, as you see it: "Lotte en Amir pakken samen pauze om 12:30", "Jij voegde Noor toe". */
export function eventText(e: ChatEvent, me: number | undefined, t: T) {
  const name = (id: number) => (id === me ? t('chat.you') : (e.names[String(id)] ?? '?'));
  const by = 'by' in e ? name(e.by) : '';
  switch (e.type) {
    case 'created':
      return t('chat.evCreated', { by, name: e.name });
    case 'added':
      return t('chat.evAdded', { by, names: joinNames(e.people.map(name), t('common.and')) });
    case 'left':
      return t('chat.evLeft', { by });
    case 'renamed':
      return t('chat.evRenamed', { by, name: e.name });
    case 'break_planned': {
      const names = joinNames(e.people.map(name), t('common.and'));
      return e.place ? t('chat.evBreakAt', { names, t: hhmm(e.start), place: e.place }) : t('chat.evBreak', { names, t: hhmm(e.start) });
    }
  }
}

/** What a message says in one line (chat list, screen readers): taken back and removed ones say so. */
export function messageText(m: ChatMessage, me: number | undefined, t: T) {
  if (m.kind === 'event' && m.payload) return eventText(m.payload, me, t);
  if (m.removed) return t('chat.removed');
  if (m.deleted) return t('chat.deleted');
  return m.body ?? '';
}

/** Under the chat's name in the list: "Lotte: ja, cafetaria om half één", "Jij: oké". */
export function preview(c: Chat, me: number | undefined, t: T) {
  const m = c.last;
  if (!m) return c.kind === 'group' ? t('chat.groupNew', { n: c.count }) : t('chat.sayHi');
  const text = messageText(m, me, t);
  if (m.kind === 'event' || m.user_id == null) return text;
  if (m.user_id === me) return t('chat.youSaid', { text });
  // One-to-one: who wrote it is clear
  if (c.kind === 'direct') return text;
  const who = c.members.find((p) => p.id === m.user_id)?.display_name;
  return who ? `${who}: ${text}` : text;
}

/** A message on its way: shown at the bottom until the server has it. `key` is its Idempotency-Key (every try). */
export type Outgoing = { key: string; body: string; state: 'sending' | 'failed' };
