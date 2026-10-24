import { addDays, monday } from './time';

/**
 * Pages of the Rooster tab. Time is split into segments: the school week (Mon–Fri) and the weekend
 * (Sat–Sun). A page is 1–5 days inside one segment. A small swipe moves one page (so after Friday you
 * see the weekend); a big swipe or fling skips the weekend (`bigNext`, `bigPrev`). Pure functions on
 * local dates, no limit back or ahead.
 */
export type Page = { start: Date; n: number };

export const MAX_DAYS = 5;

/** Monday = 0 … Sunday = 6 */
export function weekday(d: Date) {
  return (d.getDay() + 6) % 7;
}

export function isWeekend(d: Date) {
  return weekday(d) >= 5;
}

/** The segment a day is in: Mon–Fri or Sat–Sun. */
export function segment(d: Date): { start: Date; end: Date } {
  const m = monday(d);
  return isWeekend(d) ? { start: addDays(m, 5), end: addDays(m, 6) } : { start: m, end: addDays(m, 4) };
}

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** A page from `start` with up to `want` days, never past the end of its segment. */
export function page(start: Date, want: number): Page {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const room = daysBetween(s, segment(s).end) + 1;
  return { start: s, n: Math.max(1, Math.min(want, room, MAX_DAYS)) };
}

export function nextPage(p: Page, want: number): Page {
  const seg = segment(p.start);
  const after = addDays(p.start, p.n);
  return page(after > seg.end ? addDays(seg.end, 1) : after, want);
}

export function prevPage(p: Page, want: number): Page {
  const seg = segment(p.start);
  if (p.start > seg.start) {
    const start = addDays(p.start, -Math.min(want, daysBetween(seg.start, p.start)));
    return { start, n: daysBetween(start, p.start) };
  }
  // The last page of the segment before, on the same grid as going forward (Mon–Tue, Wed–Thu, Fri)
  const prev = segment(addDays(seg.start, -1));
  const len = daysBetween(prev.start, prev.end) + 1;
  const step = Math.max(1, Math.min(want, MAX_DAYS));
  return page(addDays(prev.start, Math.floor((len - 1) / step) * step), want);
}

/** A big swipe: to the next school days, flying past the weekend. */
export function bigNext(p: Page, want: number): Page {
  const n = nextPage(p, want);
  return isWeekend(n.start) && !isWeekend(p.start) ? nextPage(n, want) : n;
}

export function bigPrev(p: Page, want: number): Page {
  const n = prevPage(p, want);
  return isWeekend(n.start) && !isWeekend(p.start) ? prevPage(n, want) : n;
}

export function pageDays(p: Page): Date[] {
  return Array.from({ length: p.n }, (_, i) => addDays(p.start, i));
}

export function samePage(a: Page, b: Page) {
  return a.n === b.n && a.start.getTime() === b.start.getTime();
}

/** The page with this day on it, on the paging grid of its segment (at the weekend: the weekend). */
export function pageWith(day: Date, want: number): Page {
  const seg = segment(day);
  const step = Math.max(1, Math.min(want, MAX_DAYS));
  return page(addDays(seg.start, Math.floor(daysBetween(seg.start, day) / step) * step), want);
}

/** Where the Rooster tab opens: the page with today on it; at the weekend the coming school week. */
export function homePage(want: number, now = new Date()): Page {
  return isWeekend(now) ? page(addDays(segment(now).end, 1), want) : pageWith(now, want);
}
