import type { DetailField, DetailLayout, DetailOrigin } from '@/api/types';
import type { Key } from '@/i18n/nl';

/**
 * A lesson's details as named fields ("Labo · NOO.-01.019" → Type: Labo, Building: NOO, Floor: -01, Classroom: 019),
 * after the layout of the lesson's origin (api/roosters/details.py has the format and how it's guessed; GET
 * /me/details). The timetable only carries the raw location: it's broken up here, when a lesson is opened.
 * `detailRows` is the twin of the API's `details.apply`: change both together (tests/test_details.py has the cases).
 */

type T = (key: Key, params?: Record<string, string | number>) => string;

/** The app's own name per key; part1…part6 are 'Part 1'… */
const NAMES: Record<string, Key> = {
  type: 'details.type',
  location: 'details.location',
  campus: 'details.campus',
  building: 'details.building',
  wing: 'details.wing',
  floor: 'details.floor',
  room: 'details.room',
  group: 'details.group',
};

/** Without a layout of its own (a friend at another school, nothing fetched yet): the kind, the location, the group */
export const PLAIN: DetailLayout = { v: 1, split: null, fields: [{ keys: ['type'] }, { keys: ['location'] }, { keys: ['group'] }] };

export function keyName(key: string, t: T): string {
  if (NAMES[key]) return t(NAMES[key]);
  const n = /^part(\d)$/.exec(key);
  return n ? t('details.part', { n: n[1] }) : key;
}

/** The title a field shows: yours, else the name of its keys ('Floor + Classroom' for a merge you didn't name). */
export function fieldTitle(f: DetailField, t: T): string {
  return f.label || f.keys.map((k) => keyName(k, t)).join(' + ');
}

/** The single rooms of a location ("NOO.-01.020, NOO.-01.021" is two) */
export function rooms(location: string | null | undefined): string[] {
  return (location ?? '')
    .split(/\s*,\s*/)
    .map((r) => r.trim())
    .filter(Boolean);
}

function splitRoom(room: string, sep: string): string[] {
  return room.split(sep).map((p) => p.trim());
}

/** index = the field's place in the layout; whole = a location that didn't fit the split, shown in that field */
export type DetailRow = { index: number; title: string; value: string; whole?: boolean };

/**
 * The rows a lesson shows: per field that isn't hidden and has a value, its title and value. Merged location parts
 * are joined with the separator ("-01.019"), anything else with " · ". A location that doesn't fit the split (Online,
 * a sports hall) is shown whole, where its first part would have been. `kind` is the kind's name ('Labo').
 */
export function detailRows(l: { location?: string | null; group?: string | null }, kind: string | null, layout: DetailLayout, t: T): DetailRow[] {
  const split = layout.split;
  const locKeys = new Set(split?.parts ?? []);
  const values = new Map<string, string[]>();
  if (kind) values.set('type', [kind]);
  if (l.group) values.set('group', [l.group]);
  let whole = false;
  if (l.location) {
    values.set('location', [l.location]);
    const rs = rooms(l.location);
    if (split && rs.every((r) => splitRoom(r, split.sep).length === split.parts.length)) {
      for (const r of rs) {
        splitRoom(r, split.sep).forEach((v, i) => {
          const list = values.get(split.parts[i]) ?? [];
          if (!list.includes(v)) list.push(v);
          values.set(split.parts[i], list);
        });
      }
    } else {
      whole = locKeys.size > 0;
    }
  }
  const out: DetailRow[] = [];
  layout.fields.forEach((f, index) => {
    if (whole && f.keys.some((k) => locKeys.has(k))) {
      out.push({ index, title: f.label || keyName('location', t), value: l.location!, whole: true });
      whole = false;
      return;
    }
    if (f.hidden) return;
    const got = f.keys.filter((k) => values.has(k)).map((k) => [k, values.get(k)!.join(', ')] as const);
    if (!got.length) return;
    let text = got[0][1];
    for (let i = 1; i < got.length; i++) text += (locKeys.has(got[i - 1][0]) && locKeys.has(got[i][0]) ? split!.sep : ' · ') + got[i][1];
    out.push({ index, title: fieldTitle(f, t), value: text });
  });
  return out;
}

/** The rows grouped by line: a floor and the classroom right after it (two fields, as the student laid them out) share
 * one line ('Verdieping 00 - Lokaal 010'); every other row has a line of its own. Rows stay separate inside a group. */
export function groupLines(rows: DetailRow[], layout: DetailLayout): DetailRow[][] {
  const only = (r: DetailRow | undefined, key: string) => !!r && !r.whole && layout.fields[r.index]?.keys.length === 1 && layout.fields[r.index].keys[0] === key;
  const out: DetailRow[][] = [];
  for (let i = 0; i < rows.length; i++) {
    if (only(rows[i], 'floor') && only(rows[i + 1], 'room')) out.push([rows[i], rows[++i]]);
    else out.push([rows[i]]);
  }
  return out;
}

/** The rows a timetable card shows: not the student group ("1CH_A": the other classes in the lesson), that is for the sheet. */
export function cardRows(rows: DetailRow[], layout: DetailLayout): DetailRow[] {
  return rows.filter((r) => !layout.fields[r.index]?.keys.includes('group'));
}

/** A short name per key, for the prefix on a timetable card ("Verd. -01"); the type gets none (its value says it) */
const SHORT: Record<string, Key> = {
  location: 'details.short.location',
  campus: 'details.short.campus',
  building: 'details.short.building',
  wing: 'details.short.wing',
  floor: 'details.short.floor',
  room: 'details.short.room',
  group: 'details.short.group',
};

/** The prefix a row gets on a timetable card: the short name of its field ('Geb.', 'Verd.', 'Lok.'; a label of your own
 * shortened to 'Abc.'; merged fields joined with '+'), or null for the type and a location shown whole. Only shown
 * when prefix and value both fit (Timetable.LessonBody): the value always wins. */
export function shortTitle(row: DetailRow, layout: DetailLayout, t: T): string | null {
  const f = layout.fields[row.index];
  if (!f || row.whole || (f.keys.length === 1 && f.keys[0] === 'type')) return null;
  const cut = (w: string) => (w.length <= 5 ? w : `${w.slice(0, 3)}.`);
  if (f.label) return cut(f.label);
  return f.keys
    .filter((k) => k !== 'type')
    .map((k) => {
      if (SHORT[k]) return t(SHORT[k]);
      const n = /^part(\d)$/.exec(k);
      return n ? t('details.short.part', { n: n[1] }) : cut(k);
    })
    .join('+');
}

/** The layout for a lesson: its origin's (yours, or what was found), else PLAIN. */
export function layoutFor(origin: string | undefined, origins: DetailOrigin[] | undefined): DetailLayout {
  return origins?.find((o) => o.origin === origin)?.layout ?? PLAIN;
}

// ---- Changing a layout (onboarding/details.tsx). Each returns a new layout. --------------------------------

function withFields(layout: DetailLayout, fields: DetailField[]): DetailLayout {
  return { ...layout, fields };
}

/** Your own title; empty = the app's name again */
export function rename(layout: DetailLayout, i: number, label: string): DetailLayout {
  const clean = label.replace(/\s+/g, ' ').trim().slice(0, 24);
  return withFields(
    layout,
    layout.fields.map((f, j) => (j === i ? { keys: f.keys, ...(clean ? { label: clean } : {}), ...(f.hidden ? { hidden: true } : {}) } : f)),
  );
}

export function setHidden(layout: DetailLayout, i: number, hidden: boolean): DetailLayout {
  return withFields(
    layout,
    layout.fields.map((f, j) => (j === i ? { keys: f.keys, ...(f.label ? { label: f.label } : {}), ...(hidden ? { hidden: true } : {}) } : f)),
  );
}

/** Field i and the one after it become one field (keeps i's title; shown if either was) */
export function mergeNext(layout: DetailLayout, i: number): DetailLayout {
  const a = layout.fields[i];
  const b = layout.fields[i + 1];
  if (!a || !b) return layout;
  const merged: DetailField = { keys: [...a.keys, ...b.keys], ...(a.label ? { label: a.label } : {}), ...(a.hidden && b.hidden ? { hidden: true } : {}) };
  return withFields(layout, [...layout.fields.slice(0, i), merged, ...layout.fields.slice(i + 2)]);
}

/** A merged field back into one field per key (the first keeps the title) */
export function unmerge(layout: DetailLayout, i: number): DetailLayout {
  const f = layout.fields[i];
  if (!f || f.keys.length < 2) return layout;
  const parts: DetailField[] = f.keys.map((k, j) => ({ keys: [k], ...(j === 0 && f.label ? { label: f.label } : {}), ...(f.hidden ? { hidden: true } : {}) }));
  return withFields(layout, [...layout.fields.slice(0, i), ...parts, ...layout.fields.slice(i + 1)]);
}

/** The same layout (key order of the JSON doesn't matter) */
export function sameLayout(a: DetailLayout | null | undefined, b: DetailLayout | null | undefined): boolean {
  if (!a || !b) return a === b;
  const norm = (x: DetailLayout) =>
    JSON.stringify({ split: x.split ? { sep: x.split.sep, parts: x.split.parts } : null, fields: x.fields.map((f) => [f.keys, f.label ?? null, !!f.hidden]) });
  return norm(a) === norm(b);
}
