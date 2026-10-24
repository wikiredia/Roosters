import type { BreakRequest } from '@/api/types';
import type { Key, Lang } from '@/i18n';
import { ApiError, NetworkError } from '@/lib/api';

import { joinNames } from './status';
import { addDays, isoDay, parseDay, shortDate } from './time';

type T = (k: Key, p?: Record<string, string | number>) => string;

/** The others in a request, seen by you: whoever you asked, or whoever asked you. */
export function otherPeople(b: BreakRequest) {
  return b.mine ? b.members : [b.from];
}

/** "jij gaat naar Kayra", "Reda komt naar jou", "op cafetaria": who walks, seen by you. `mode` is as the asker put it. */
export function howText(b: BreakRequest, t: T) {
  if (b.mode === 'meet') return b.place ? t('break.at', { place: b.place }) : t('break.somewhere');
  const names = b.mine ? joinNames(b.members.map((m) => m.display_name), t('common.and')) : b.from.display_name;
  // The asker comes (i_come): from their side the others wait; from yours, they come to you
  const theyCome = b.mine ? b.mode === 'you_come' : b.mode === 'i_come';
  return theyCome ? t('break.theyCome', { names }) : t('break.youGo', { names });
}

/** "Vandaag", "Morgen", "di 28 okt" */
export function dayWord(day: string, today: string, t: T, lang: Lang) {
  if (day === today) return t('today.title');
  if (day === isoDay(addDays(parseDay(today), 1))) return t('today.tomorrow');
  return shortDate(parseDay(day), lang);
}

/** What went wrong asking, in words: who has class then, it was asked already, or the server's own message. */
export function breakError(e: unknown, names: Map<number, string>, t: T) {
  if (e instanceof NetworkError) return t('common.offline');
  if (!(e instanceof ApiError)) return t('common.tryAgain');
  const busy = (reason: unknown, name: string) =>
    t(reason === 'home' ? 'break.busyHome' : reason === 'no_classes' ? 'break.busyNone' : 'break.busyClass', { name });
  if (e.code === 'break_busy' && Array.isArray(e.extra.people)) {
    return (e.extra.people as { id: number; reason: string }[]).map((p) => busy(p.reason, names.get(p.id) ?? '?')).join('. ');
  }
  if (e.code === 'break_busy_me') {
    return t(e.extra.reason === 'home' ? 'break.meHome' : e.extra.reason === 'no_classes' ? 'break.meNone' : 'break.meClass');
  }
  if (e.code === 'break_dup') {
    return t(e.extra.state === 'accepted' ? 'break.dupPlanned' : e.extra.kind === 'theirs' ? 'break.dupTheirs' : 'break.dupMine');
  }
  return e.message;
}

/** "45 min", "1 u", "1 u 30": how long a free window lasts. */
export function duration(min: number, t: T) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return t('break.mins', { n: m });
  return m ? t('break.hoursMins', { h, m }) : t('break.hours', { h });
}
