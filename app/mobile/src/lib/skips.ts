import type { Lesson, Together } from '@/api/types';
import { freeGaps, isFree, isOff, lessonKind } from '@/components/timetable/Timetable';
import type { IconName } from '@/components/ui/Icon';
import type { Key } from '@/i18n';

import { duration } from './breaks';
import { joinNames } from './status';
import { hhmm } from './time';

type T = (k: Key, p?: Record<string, string | number>) => string;

/** A class to skip (or take back): one course on one day, from the start to the end of the whole block, so a double
 * period goes in one go. The same shape as PUT /api/v1/me/skips. */
export type SkipTarget = { day: string; course: string; start: number; end: number };

export function skipTarget(l: Lesson): SkipTarget {
  return { day: l.day, course: l.course ?? '', start: l.start, end: l.end };
}

/** Whether a lesson falls under a skip: the same day and course, inside its start and end. */
export function inSkip(l: Lesson, s: SkipTarget) {
  return l.day === s.day && l.course === s.course && s.start <= l.start && l.end <= s.end;
}

/** The lessons with that skip on (or off): what the server will answer, for the cache before it does. */
export function withSkip(lessons: Lesson[], s: SkipTarget, skipped: boolean): Lesson[] {
  return lessons.map((l) => (inSkip(l, s) ? { ...l, skipped: skipped || undefined, busy: !skipped && !isOff(l) } : l));
}

/** Whether you can skip it: a lesson of yours that takes place and isn't over yet. */
export function canSkip(l: Lesson, today: string, now: number) {
  return !!l.course && !isFree(l) && (l.day > today || (l.day === today && l.end > now));
}

/** One line of the summary after a skip: an icon and a sentence. `warn`: say it in red (an exam). */
export type SkipChange = { icon: IconName; text: string; warn?: boolean };

/**
 * What skipping changes, in a few sentences: your break around it (longer, or a new one), when you have to be in or
 * are done, whether it's an exam, and with whom you now share a break (new, or longer) during that time.
 * `lessons`: your lessons of that day before the skip; `before`/`after`: who you share a break with that day, before
 * and after (after: the server's answer, null while it's on its way).
 */
export function skipChanges(p: { lessons: Lesson[]; target: SkipTarget; before: Together[]; after: Together[] | null; names: Map<number, string>; t: T }): SkipChange[] {
  const { target, t } = p;
  const out: SkipChange[] = [];
  const day = p.lessons.filter((l) => l.day === target.day);
  const skipped = day.filter((l) => inSkip(l, target));
  if (skipped.some((l) => lessonKind(l) === 'exam')) out.push({ icon: 'flag', text: t('skip.exam'), warn: true });

  const takes = (ls: Lesson[]) => ls.filter((l) => !isFree(l)).sort((a, b) => a.start - b.start);
  const was = takes(day);
  const now = takes(withSkip(day, target, true));
  if (!now.length) out.push({ icon: 'sun', text: t('skip.dayOff') });
  else if (was.length) {
    const gap = freeGaps(now).find((g) => g.start <= target.start && target.end <= g.end);
    if (gap) {
      const old = Math.max(0, ...freeGaps(was).filter((g) => g.start >= gap.start && g.end <= gap.end).map((g) => g.end - g.start));
      const fmt = { from: hhmm(gap.start), to: hhmm(gap.end), dur: duration(gap.end - gap.start, t) };
      out.push({ icon: 'coffee', text: old ? t('skip.breakLonger', { ...fmt, was: duration(old, t) }) : t('skip.breakNew', fmt) });
    }
    if (now[0].start > was[0].start) out.push({ icon: 'clock', text: t('skip.comeLater', { t: hhmm(now[0].start), was: hhmm(was[0].start) }) });
    const end = (ls: Lesson[]) => Math.max(...ls.map((l) => l.end));
    if (end(now) < end(was)) out.push({ icon: 'logout', text: t('skip.leaveEarly', { t: hhmm(end(now)), was: hhmm(end(was)) }) });
  }

  if (!p.after) {
    out.push({ icon: 'together', text: t('skip.checking') });
    return out;
  }
  // Per friend: a shared break during the class you skip that is new, or longer than it was; the same window grouped
  const touches = (s: { start: number; end: number }) => s.start < target.end && target.start < s.end;
  const groups = new Map<string, { kind: 'new' | 'longer'; start: number; end: number; gain: number; names: string[] }>();
  for (const s of p.after.filter(touches)) {
    const old = p.before.filter((b) => b.id === s.id && b.start < s.end && s.start < b.end);
    const gain = s.end - s.start - Math.max(0, ...old.map((b) => b.end - b.start));
    if (old.length && gain <= 0) continue;
    const kind = old.length ? 'longer' : 'new';
    const key = `${kind}:${s.start}:${s.end}`;
    const g = groups.get(key) ?? { kind, start: s.start, end: s.end, gain, names: [] };
    g.names.push(p.names.get(s.id) ?? '?');
    g.gain = Math.min(g.gain, gain);
    groups.set(key, g);
  }
  for (const g of [...groups.values()].sort((a, b) => a.start - b.start)) {
    const fmt = { names: joinNames(g.names, t('common.and')), from: hhmm(g.start), to: hhmm(g.end) };
    out.push({ icon: 'together', text: g.kind === 'new' ? t('skip.withNew', fmt) : t('skip.withLonger', { ...fmt, dur: duration(g.gain, t) }) });
  }
  if (!groups.size && !p.after.some(touches)) out.push({ icon: 'users', text: t('skip.nobody') });
  return out;
}
