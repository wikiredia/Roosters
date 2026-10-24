import type { Lang } from '@/i18n';

/** Minutes since midnight -> "09:30" (always 24 h, tabular figures in the UI). */
export function hhmm(min: number | null | undefined): string {
  if (min == null) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function range(start: number, end: number) {
  return `${hhmm(start)}–${hhmm(end)}`;
}

/** Local date as YYYY-MM-DD. */
export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function monday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7;
  return addDays(x, -wd);
}

export function nowMin(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}

const locale = (lang: Lang) => (lang === 'nl' ? 'nl-BE' : 'en-GB');

/** "Dinsdag 20 oktober" / "Tuesday 20 October" */
export function longDate(d: Date, lang: Lang) {
  const s = d.toLocaleDateString(locale(lang), { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "di 20 okt" */
export function shortDate(d: Date, lang: Lang) {
  return d.toLocaleDateString(locale(lang), { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Ma", "Di", ... */
export function weekdayShort(d: Date, lang: Lang) {
  const s = d.toLocaleDateString(locale(lang), { weekday: 'short' }).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1, 2);
}

/** "sep – jan": the months of a semester */
export function monthSpan(a: Date, b: Date, lang: Lang) {
  const m = (d: Date) => d.toLocaleDateString(locale(lang), { month: 'short' }).replace('.', '');
  return `${m(a)} – ${m(b)}`;
}

export function monthRange(a: Date, b: Date, lang: Lang) {
  const month = b.toLocaleDateString(locale(lang), { month: 'long' });
  return `${a.getDate()} – ${b.getDate()} ${month}`;
}

/** Minutes ago, for "Bijgewerkt 4 min geleden" */
export function minutesAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}
