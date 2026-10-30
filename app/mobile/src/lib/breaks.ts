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
    t(reason === 'home' ? 'break.busyHome' : reason === 'no_classes' ? 'break.busyNone' : reason === 'busy' ? 'break.busyBusy' : 'break.busyClass', { name });
  if (e.code === 'break_busy' && Array.isArray(e.extra.people)) {
    return (e.extra.people as { id: number; reason: string }[]).map((p) => busy(p.reason, names.get(p.id) ?? '?')).join('. ');
  }
  if (e.code === 'break_busy_me') {
    return t(e.extra.reason === 'home' ? 'break.meHome' : e.extra.reason === 'no_classes' ? 'break.meNone' : e.extra.reason === 'busy' ? 'break.meBusy' : 'break.meClass');
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

/** Where you stand with one friend about a break: planned (someone said yes), asked (you asked, no answer yet),
 * theirs (they asked you, you haven't answered), declined (a no). */
export type WithState = 'planned' | 'asked' | 'theirs' | 'declined';
const RANK: Record<WithState, number> = { planned: 3, asked: 2, theirs: 2, declined: 1 };

/** The request with `id` on `day` that overlaps start–end, and what it means for you (the strongest when several). */
export function stateWith(breaks: BreakRequest[] | undefined, id: number, day: string, start: number, end: number): { state: WithState; request: BreakRequest } | null {
  let best: { state: WithState; request: BreakRequest } | null = null;
  for (const b of breaks ?? []) {
    if (b.day !== day || b.start >= end || start >= b.end) continue;
    let state: WithState | null = null;
    if (b.mine) {
      const m = b.members.find((x) => x.id === id);
      if (m) state = m.response === 'accepted' ? 'planned' : m.response === 'declined' ? 'declined' : 'asked';
    } else if (b.from.id === id) {
      state = b.my_response === 'accepted' ? 'planned' : b.my_response === 'declined' ? 'declined' : 'theirs';
    }
    if (state && (!best || RANK[state] > RANK[best.state])) best = { state, request: b };
  }
  return best;
}

/** A shared break with several friends, as one block: planned when one of them is, asked while a question is open,
 * declined only when every one of them said no; null: nothing asked yet. */
export function slotState(breaks: BreakRequest[] | undefined, ids: number[], day: string, start: number, end: number): 'planned' | 'asked' | 'declined' | null {
  const states = ids.map((id) => stateWith(breaks, id, day, start, end)?.state ?? null);
  if (states.includes('planned')) return 'planned';
  if (states.includes('asked') || states.includes('theirs')) return 'asked';
  if (states.length && states.every((s) => s === 'declined')) return 'declined';
  return null;
}

/** One stretch of a break with the same people in it: alone (`ids` empty), or with these friends. */
export type PlanPart = { start: number; end: number; ids: number[] };

/**
 * Your break from `span.start` to `span.end` cut where someone comes or goes: "10–11 alone, 11–12:30 with Kayra,
 * 12:30–14 with Kayra and Yeno". `together`: who you share a break with that day (each friend's free window, as the
 * API gives them). Next stretches with the same people become one; friends in the order they first come.
 */
export function breakPlan(span: { start: number; end: number }, together: { id: number; start: number; end: number }[]): PlanPart[] {
  const inside = together.filter((s) => s.start < span.end && span.start < s.end);
  const cuts = [...new Set([span.start, span.end, ...inside.flatMap((s) => [s.start, s.end])])].filter((m) => m >= span.start && m <= span.end).sort((a, b) => a - b);
  const order = [...new Set([...inside].sort((a, b) => a.start - b.start).map((s) => s.id))];
  const out: PlanPart[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]];
    const ids = order.filter((id) => inside.some((s) => s.id === id && s.start <= a && b <= s.end));
    const last = out[out.length - 1];
    if (last && last.ids.join() === ids.join()) last.end = b;
    else out.push({ start: a, end: b, ids });
  }
  return out;
}
