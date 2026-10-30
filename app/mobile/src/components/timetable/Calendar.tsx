import { memo, type RefObject, useCallback, useEffect, useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Easing, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useBreaks, useFriends, useSkip, useWeeks } from '@/api/hooks';
import type { Lesson, Together } from '@/api/types';
import { BreakSheet, type BreakTarget } from '@/components/BreakSheet';
import { Button, IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { AView, enter, exit, layout } from '@/components/ui/Motion';
import { dropPeek, openPeek, peekSheet, SHEET_IDLE, SHEET_OPEN, SHEET_PEEK, type SheetPeek, useSheetPeek } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { type Lang, useT } from '@/i18n';
import { dateAt, dayIndex, homeStart, MAX_DAYS, mondayOf, weekdayOf } from '@/lib/days';
import { useStable } from '@/lib/latest';
import { PerfProfile } from '@/lib/perf';
import { skipChanges, skipTarget, type SkipTarget } from '@/lib/skips';
import { prefs } from '@/lib/storage';
import { createStore } from '@/lib/store';
import { isoDay, nowMin, parseDay, weekdayShort } from '@/lib/time';

import { type DayData, useDays } from './DayCache';
import { DayGrid, type GridPeeks, type GridZoom, LABEL_H, RESIZE, SWIPE } from './DayGrid';
import { DayStrip } from './DayStrip';
import { LessonSheet, OverlapSheet } from './LessonSheet';
import { DragLayer, useSkipDrag } from './SkipDrag';
import { type SkipNote, SkipToast } from './SkipToast';
import { isFree, Legend, type LegendItem, TimeAxis } from './Timetable';
import { TodayPill } from './TodayPill';

/** Hours always on screen; earlier or later lessons stretch them. */
const HOURS: [number, number] = [8, 18];
const AXIS_W = 30;
/** What the legend shows when there's nothing to show yet */
const DEFAULT_LEGEND: LegendItem[] = ['theory', 'lab'];
/** The sheets a tap on the grid opens (`GridPeeks`) */
type PeekKind = keyof GridPeeks;
const PEEK_KINDS: PeekKind[] = ['lesson', 'overlap', 'ask'];
/** The hours glide to new ones (a zoom, a day with an earlier lesson) in this long */
const ZOOM = { duration: 250, easing: Easing.inOut(Easing.cubic) };

/** The hours the days show: the standard ones, or (zoomed) only those of the lessons; earlier or later lessons stretch them */
function hoursFor(days: (DayData | undefined)[], zoomed: boolean): [number, number] {
  const spans = days.flatMap((d) => (d?.bounds ? [d.bounds] : []));
  if (zoomed && spans.length) {
    const a = Math.floor(Math.min(...spans.map((b) => b.start)) / 60);
    const b = Math.ceil(Math.max(...spans.map((b) => b.end)) / 60);
    return [a, Math.max(b, a + 2)];
  }
  let [h0, h1] = HOURS;
  for (const b of spans) {
    h0 = Math.min(h0, Math.floor(b.start / 60));
    h1 = Math.max(h1, Math.ceil(b.end / 60));
  }
  return [h0, h1];
}

/** A grid sheet that shouldn't be there (peeking, or opened by the UI thread, with nothing to show): out of sight */
function putAway(p: SheetPeek) {
  if (p.stage.get() === SHEET_PEEK) dropPeek(p);
  else if (p.stage.get() === SHEET_OPEN) {
    p.stage.set(SHEET_IDLE);
    p.progress.set(withTiming(0, { duration: 120 }));
  }
}

/** "19 – 23 okt", "28 okt – 3 nov", "di 20 okt": always short enough for one line. */
export function rangeLabel(a: Date, b: Date, lang: Lang) {
  const loc = lang === 'nl' ? 'nl-BE' : 'en-GB';
  const m = (d: Date) => d.toLocaleDateString(loc, { month: 'short' }).replace('.', '');
  if (a.getTime() === b.getTime()) return d1(a, loc);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${m(b)}`;
  return `${a.getDate()} ${m(a)} – ${b.getDate()} ${m(b)}`;
}
const d1 = (d: Date, loc: string) => d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' });

/** What the calendar shows, for the screen's header: the first day, how many, and whether that's not the standard view. */
export type CalendarView = { start: number; want: number; custom: boolean };
export type CalendarControl = { reset: () => void };

type Props = {
  /** Only shared breaks with these friends (Vergelijken); all friends when left out (Rooster) */
  only?: number[];
  /** The first day to show (a day index, lib/days); the week of today when left out */
  initialStart?: number;
  /** Remember how many days you like and show the tips (the Rooster tab); Vergelijken starts fresh each time */
  remember?: boolean;
  onView?: (v: CalendarView) => void;
  control?: RefObject<CalendarControl | null>;
};

/**
 * The calendar: your days side by side (1–7), scrolled continuously day by day, as far back or ahead as you like,
 * with the shared breaks in yellow. The week strip on top, the grid's columns and their widths share the same
 * animated values (offset, count), so they move together in the same frame. Data comes a week at a time and only
 * the columns wait for it; dates are there before you land. Pinch or drag the strip's handle for more or fewer
 * days, double tap to zoom in on your lessons, tap a lesson or a shared break for its sheet. Drag a class into the
 * bin on the right (or 'Skip' in its sheet) to skip it: a short summary of what that changes, with Undo, comes up
 * at the bottom (SkipToast).
 * The Rooster tab and Vergelijken (with `only`: the friends you picked) both show this.
 * Memo, and built so that a state change here renders as little as possible: every child is memo with props that keep
 * their identity (callbacks read the newest state through `latest`), so a swipe, a sheet or a header change on the
 * screen above re-renders only what it concerns.
 */
export const Calendar = memo(function Calendar({ only, initialStart, remember = false, onView, control }: Props) {
  const { t, lang } = useT();
  const friends = useFriends();
  const breaks = useBreaks();
  const today = dayIndex(new Date());
  const [want, setWant] = useState(5);
  const [start, setStart] = useState(() => initialStart ?? homeStart(5, today, () => true));
  // Where the columns can look up which way you went and where you are, without rendering when it changes
  const [view] = useState(() => createStore<{ dir: 1 | -1; start: number; want: number }>({ dir: 1, start, want: 5 }));
  useInsertionEffect(() => {
    view.set((v) => (v.start === start && v.want === want ? v : { ...v, start, want }));
  }, [view, start, want]);
  /** Which way a move to `target` goes: the lessons of the columns that arrive slide in from that side */
  const heading = useCallback((target: number) => view.set((v) => ({ ...v, dir: target >= v.start ? 1 : -1 })), [view]);
  const [zoomed, setZoomed] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [stripW, setStripW] = useState(0);
  const [hint, setHint] = useState<'days' | 'zoom' | null>(null);
  const [learned, setLearned] = useState(true);
  const [open, setOpen] = useState<{ lesson: Lesson; together: Together[] } | null>(null);
  // Overlapping lessons tapped: which one? Then that one's sheet
  const [choose, setChoose] = useState<{ lessons: Lesson[]; day: number } | null>(null);
  const chosen = useRef(false);
  const [ask, setAsk] = useState<BreakTarget>(null);
  // A tap on the grid: its sheet peeks first (the grid starts that on the UI thread), and opens fully when the double
  // tap's window runs out without a second tap. `peeking`: the sheet that has its content but isn't open yet.
  // `answered`: what the last grid tap turned out to be, kept in a ref because the UI thread's next step
  // (onPeekOpen, onDoubleTap) can come before React has rendered it
  const peekLesson = useSheetPeek();
  const peekOverlap = useSheetPeek();
  const peekAsk = useSheetPeek();
  const peeks = useMemo<GridPeeks>(() => ({ lesson: peekLesson, overlap: peekOverlap, ask: peekAsk }), [peekLesson, peekOverlap, peekAsk]);
  const [peeking, setPeeking] = useState<PeekKind | null>(null);
  const answered = useRef<PeekKind | null>(null);
  // Skipping: the class under your finger (the dragged card shows it), the summary at the bottom, the last skip (Undo)
  const drag = useSkipDrag();
  const skip = useSkip();
  const [lifted, setLifted] = useState<Lesson | null>(null);
  const [note, setNote] = useState<SkipNote | null>(null);
  const lastSkip = useRef<SkipTarget | null>(null);

  // Shared with the strip and the grid (UI thread)
  const offset = useSharedValue(start);
  const count = useSharedValue(want);
  const k = useSharedValue(Math.min(weekdayOf(start), 7 - want));
  const busyWeekends = useSharedValue<number[]>([]);

  // Data: the weeks around what you see, one request each
  const from = start - 7;
  const to = start + 14;
  const mondays = useMemo(() => {
    const out: string[] = [];
    for (let m = mondayOf(from); m <= to; m += 7) out.push(isoDay(dateAt(m)));
    return out;
  }, [from, to]);
  const weeks = useWeeks(mondays);
  const names = useMemo(() => new Map((friends.data ?? []).map((f) => [f.id, f.display_name])), [friends.data]);
  // Every day with what's derived from it (merged lessons, blocks, overlaps, free gaps, ...), built once per week
  // that comes in: moving `start` reuses the weeks still in the window (DayCache)
  const byDay = useDays(
    weeks.map((w) => w.data),
    mondayOf(from),
    names,
    breaks.data,
    only,
    today,
    lang,
  );

  // Weekends with something on them: a swipe doesn't skip those
  // (also kept here on the JS side: render code never reads a shared value)
  const busySats = useMemo(() => {
    const busy: number[] = [];
    for (const [day, d] of byDay) if (day % 7 === 5 && (d.lessons.length || byDay.get(day + 1)?.lessons.length)) busy.push(day);
    return busy;
  }, [byDay]);
  useEffect(() => {
    busyWeekends.set(busySats);
  }, [busySats, busyWeekends]);
  const emptyWeekend = (sat: number) => !busySats.includes(sat);
  // The dots under the strip's dates
  const kinds = useMemo(() => new Map([...byDay].map(([day, d]) => [day, d.kinds])), [byDay]);

  /** Go to a view: the grid slides there (from the side you came from), the strip follows. */
  function moveTo(target: number, n = want, animate = true) {
    heading(target);
    setStart(target);
    setWant(n);
    const kk = Math.min(weekdayOf(target), 7 - n);
    if (animate) {
      offset.set(withSpring(target, SWIPE));
      count.set(withSpring(n, RESIZE));
      k.set(withSpring(kk, SWIPE));
    } else {
      offset.set(target);
      count.set(n);
      k.set(kk);
    }
  }

  function onTarget(target: number) {
    heading(target);
    setStart(target);
    k.set(withSpring(Math.min(weekdayOf(target), 7 - want), SWIPE));
  }

  function setDays(n: number, viaHandle: boolean) {
    const m = Math.max(1, Math.min(MAX_DAYS, n));
    chosen.current = true;
    setWant(m);
    if (!remember) return;
    prefs.set('rooster.days', m);
    if (!viaHandle) return;
    if (hint === 'days') {
      setHint(null);
      prefs.set('hint.days', true);
    } else if (!learned) {
      // Used the handle on its own: the − / + buttons can go, and the next tip comes
      setLearned(true);
      prefs.set('days.learned', true);
      prefs.get('hint.zoom', false).then((seen) => !seen && setHint('zoom'));
    }
  }

  function step(delta: number) {
    const n = Math.max(1, Math.min(MAX_DAYS, want + delta));
    count.set(withSpring(n, RESIZE));
    k.set(withSpring(Math.min(weekdayOf(start), 7 - n), RESIZE));
    setDays(n, false);
  }

  // Remember how many days you like; without a choice: 5, or 7 when this week's weekend has something on it
  useEffect(() => {
    if (!remember) return;
    prefs.get<number | null>('rooster.days', null).then((n) => {
      if (n) {
        chosen.current = true;
        moveTo(homeStart(n, today, () => true), n, false);
      }
    });
    prefs.get('hint.days', false).then((seen) => setHint(seen ? null : 'days'));
    prefs.get('days.learned', false).then((l) => {
      setLearned(l);
      if (l) prefs.get('hint.zoom', false).then((seen) => !seen && setHint((h) => h ?? 'zoom'));
    });
  }, []);
  const weekendBusy = byDay.get(mondayOf(today) + 5)?.lessons.length || byDay.get(mondayOf(today) + 6)?.lessons.length;
  useEffect(() => {
    if (remember && !chosen.current && weekendBusy && want === 5) moveTo(mondayOf(today), 7, false);
  }, [weekendBusy]);

  /** A shared break tapped: "Pauze samen?" with everyone in it, each with their own free window (today from now
   * on). Hatched ones (over, too far ahead) never get here. */
  function askBreak(day: number, span: { start: number; end: number }) {
    const byId = new Map((friends.data ?? []).map((f) => [f.id, f]));
    const now = day === today ? nowMin() : 0;
    const people = (byDay.get(day)?.raw ?? [])
      .filter((s) => s.start < span.end && span.start < s.end && s.end > now && byId.has(s.id))
      .filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i)
      .map((s) => ({ ...byId.get(s.id)!, start: Math.max(s.start, now), end: s.end }));
    if (people.length) setAsk({ kind: 'ask', day: isoDay(dateAt(day)), people });
    return people.length > 0;
  }

  /** Skip a class (dropped in the bin, or 'Skip' in its sheet): it's gone at once, and the summary says what that
   * changes: first what we know here (your breaks, when you're in), then with whom, once the server answers. */
  function doSkip(l: Lesson) {
    const d = byDay.get(dayIndex(parseDay(l.day)));
    const target = skipTarget(l);
    const lessons = d?.lessons ?? [];
    const before = d?.raw ?? [];
    const changes = (after: Together[] | null) => skipChanges({ lessons, target, before, after, names, t });
    const id = Date.now();
    lastSkip.current = target;
    setNote({ id, kind: 'skipped', course: target.course, changes: changes(null) });
    skip({ ...target, skipped: true }).then(
      (r) => setNote((n) => (n?.id === id ? { ...n, changes: changes(r.together.filter((s) => !only || only.includes(s.id))) } : n)),
      () => {
        lastSkip.current = null;
        setNote((n) => (n?.id === id ? { id, kind: 'failed', course: target.course, changes: [] } : n));
      },
    );
  }

  /** Back on your timetable: Undo in the summary, or 'I'll go after all' in a skipped class's sheet. */
  function unskip(target: SkipTarget) {
    lastSkip.current = null;
    setNote({ id: Date.now(), kind: 'undone', course: target.course, changes: [] });
    skip({ ...target, skipped: false }).catch(() => setNote({ id: Date.now(), kind: 'failed', course: target.course, changes: [] }));
  }

  const home = initialStart ?? homeStart(want, today, emptyWeekend);
  /** Back to the standard view: this week (or the one it opened on), Monday to Friday, zoomed out. */
  function reset() {
    setZoomed(false);
    setDays(5, false);
    moveTo(initialStart ?? homeStart(5, today, emptyWeekend), 5);
  }
  useImperativeHandle(control, () => ({ reset }));

  const visible = Array.from({ length: want }, (_, i) => start + i);
  // 'Vandaag' only when you've moved away from today (and from where the calendar opens)
  const showsToday = visible.includes(today) || start === home;
  // An empty weekend at the right end of the view (nothing on Saturday and/or Sunday): an arrow in that space to the
  // next day with something possible on it: Sunday when it has something, otherwise Monday, at the left
  const empty = (d: number) => {
    const x = byDay.get(d);
    return !!x && !x.loading && !x.lessons.length && !x.together.length;
  };
  let firstEmpty = visible.length;
  while (firstEmpty > 0 && weekdayOf(visible[firstEmpty - 1]) >= 5 && empty(visible[firstEmpty - 1])) firstEmpty--;
  const sunday = firstEmpty < visible.length ? mondayOf(visible[firstEmpty]) + 6 : 0;
  const onward = firstEmpty < visible.length ? (!visible.includes(sunday) && byDay.get(sunday) && !empty(sunday) ? sunday : sunday + 1) : null;
  // The hours are an array with the same identity while the two numbers are the same (the columns and the axis are memo)
  const span = hoursFor(
    visible.map((d) => byDay.get(d)),
    zoomed,
  );
  const hoursKey = `${span[0]}:${span[1]}`;
  const hours = useMemo(() => hoursKey.split(':').map(Number) as [number, number], [hoursKey]);
  const legendItems = new Set<LegendItem>();
  for (const d of visible) for (const i of byDay.get(d)?.legend ?? []) legendItems.add(i);
  const legendKey = [...legendItems].join();
  const legend = useMemo<LegendItem[]>(() => (legendKey ? (legendKey.split(',') as LegendItem[]) : DEFAULT_LEGEND), [legendKey]);
  // Anything else than the standard view (zoomed, other than 5 days, not starting on a Monday): the screen's title becomes 'Reset'
  const custom = zoomed || want !== 5 || weekdayOf(start) !== 0;
  useEffect(() => {
    onView?.({ start, want, custom });
  }, [start, want, custom]);
  const pxPerHour = size.h ? (size.h - LABEL_H) / (hours[1] - hours[0]) : 40;
  // The hours as they are on screen (DayGrid's GridZoom): they glide when the hours change, and jump when only the
  // size does. Set before the first paint, so the first frame still shows the old hours and then moves.
  const zoomH0 = useSharedValue(hours[0]);
  const zoomPph = useSharedValue(pxPerHour);
  const zoomRange = useSharedValue<[number, number]>([start, start + want - 1]);
  const zoom = useMemo<GridZoom>(() => ({ h0: zoomH0, pph: zoomPph, range: zoomRange }), [zoomH0, zoomPph, zoomRange]);
  // The days in view, for the next zoom: up to date before a double tap renders anything
  useEffect(() => {
    zoomRange.set([start, start + want - 1]);
  }, [start, want, zoomRange]);
  const shownHours = useRef(hoursKey);
  useLayoutEffect(() => {
    const glide = shownHours.current !== hoursKey && !!size.h;
    shownHours.current = hoursKey;
    zoomRange.set([start, start + want - 1]);
    zoomH0.set(glide ? withTiming(hours[0], ZOOM) : hours[0]);
    zoomPph.set(glide ? withTiming(pxPerHour, ZOOM) : pxPerHour);
  }, [hoursKey, pxPerHour]);
  const now = nowMin();

  // Stable callbacks for everything below (all of it memo): opening a sheet re-renders this component and that
  // sheet, never the 20-odd day columns, the strip or the other sheets, so a tap on a lesson answers at once. They
  // read the newest state through `latest`, which is up to date before any event handler runs.
  const latest = useRef({ byDay, askBreak, onTarget, setDays, start, want, doSkip, unskip, reset, moveTo, home, choose, today });
  useInsertionEffect(() => {
    latest.current = { byDay, askBreak, onTarget, setDays, start, want, doSkip, unskip, reset, moveTo, home, choose, today };
  });
  const data = useCallback((d: number) => byDay.get(d), [byDay]);
  /** What a grid tap opens: `kind`'s sheet, only peeking while the grid's double tap window is still open (`peek`,
   * from the grid's gesture), else fully (a screen reader, or the window ran out already). Any other peek goes away. */
  const answer = useCallback(
    (kind: PeekKind | null, peek: boolean) => {
      answered.current = peek ? kind : null;
      // No other sheet can be open while the grid takes a tap (the scrim covers it): any other one is a stray peek.
      // `guessed`: how far the UI thread got with another sheet than the one JS found (the data changed in between)
      let guessed = SHEET_IDLE;
      for (const k of PEEK_KINDS) {
        if (k === kind) continue;
        guessed = Math.max(guessed, peeks[k].stage.get());
        putAway(peeks[k]);
      }
      // Take over where it got. Nothing peeking at all means the double tap already put it away: leave it out of sight
      if (kind && peek && peeks[kind].stage.get() === SHEET_IDLE) {
        if (guessed === SHEET_PEEK) peekSheet(peeks[kind]);
        else if (guessed === SHEET_OPEN) openPeek(peeks[kind]);
      }
      // Pending until the window runs out (onPeekOpen) or a double tap forgets it (onDoubleTap); open when it already ran out
      setPeeking(kind && peek && peeks[kind].stage.get() !== SHEET_OPEN ? kind : null);
    },
    [peeks],
  );
  const onPressLesson = useCallback(
    (lesson: Lesson, day: number, peek = false) => {
      setOpen({ lesson, together: latest.current.byDay.get(day)?.raw ?? [] });
      answer('lesson', peek);
    },
    [answer],
  );
  const onPressOverlap = useCallback(
    (lessons: Lesson[], day: number, peek = false) => {
      setChoose({ lessons, day });
      answer('overlap', peek);
    },
    [answer],
  );
  const onPressTogether = useCallback(
    (day: number, span: { start: number; end: number }, peek = false) => answer(latest.current.askBreak(day, span) ? 'ask' : null, peek),
    [answer],
  );
  const onPressNothing = useCallback(() => answer(null, false), [answer]);
  // The window ran out: the peeking sheet is open now. A sheet the UI thread opened that JS found nothing for goes away.
  const onPeekOpen = useCallback(() => {
    setPeeking(null);
    for (const k of PEEK_KINDS) if (k !== answered.current) putAway(peeks[k]);
    answered.current = null;
  }, [peeks]);
  const onTargetCb = useCallback((s: number) => latest.current.onTarget(s), []);
  const onCount = useCallback(
    (n: number, s: number) => {
      setStart(s);
      k.set(withSpring(Math.min(weekdayOf(s), 7 - n), RESIZE));
      latest.current.setDays(n, false);
    },
    [k],
  );
  // A double tap: zoom, and the sheet the first tap peeked (the grid already put it away) is forgotten
  const onDoubleTap = useCallback(() => {
    setZoomed((z) => !z);
    const k = answered.current;
    answered.current = null;
    setPeeking(null);
    if (k === 'lesson') setOpen(null);
    else if (k === 'overlap') setChoose(null);
    else if (k === 'ask') setAsk(null);
  }, []);
  // The strip above the grid
  const onStripPick = useCallback(
    (day: number) => {
      const { want, moveTo } = latest.current;
      moveTo(want >= 5 ? Math.max(mondayOf(day), Math.min(day, mondayOf(day) + 7 - want)) : day);
    },
    [],
  );
  const onStripMove = useCallback(
    (s: number) => {
      heading(s);
      setStart(s);
    },
    [heading],
  );
  const onStripResizeEnd = useCallback(
    (n: number, s?: number) => {
      if (s !== undefined && s !== latest.current.start) {
        heading(s);
        setStart(s);
      }
      latest.current.setDays(n, true);
    },
    [heading],
  );
  // Double tap on the strip above the grid = the screen's 'Reset'
  const onStripReset = useStable(reset);
  const stripDoubleTap = useMemo(() => Gesture.Tap().numberOfTaps(2).maxDelay(250).onEnd((_e, ok) => ok && scheduleOnRN(onStripReset)), [onStripReset]);
  const classAt = (day: number, start: number) => latest.current.byDay.get(day)?.merged.find((l) => l.start === start && !isFree(l));
  const onPickClass = useCallback((day: number, start: number) => setLifted(classAt(day, start) ?? null), []);
  const onDropClass = useCallback((day: number, start: number) => {
    const l = classAt(day, start);
    if (l) latest.current.doSkip(l);
  }, []);
  const onTodayPress = useCallback(() => latest.current.moveTo(latest.current.home), []);
  const onToastDone = useCallback(() => setNote(null), []);
  const onToastUndo = useCallback(() => {
    if (lastSkip.current) latest.current.unskip(lastSkip.current);
  }, []);
  // The sheets
  const closeChoice = useCallback(() => setChoose(null), []);
  const pickChoice = useCallback(
    (lesson: Lesson) => {
      const day = latest.current.choose?.day ?? latest.current.today;
      setChoose(null);
      // One sheet at a time: the next opens once this one is on its way out
      setTimeout(() => setOpen({ lesson, together: latest.current.byDay.get(day)?.raw ?? [] }), 200);
    },
    [],
  );
  const closeAsk = useCallback(() => setAsk(null), []);
  const closeLesson = useCallback(() => setOpen(null), []);
  const skipFromSheet = useCallback(
    (l: Lesson) => {
      setOpen(null);
      latest.current.doSkip(l);
    },
    [],
  );
  const unskipFromSheet = useCallback(
    (l: Lesson) => {
      setOpen(null);
      latest.current.unskip(skipTarget(l));
    },
    [],
  );

  return (
    <PerfProfile id="Calendar">
      {/* Above the grid (zIndex): tips may hang over it */}
      <View style={{ zIndex: 10, elevation: 10 }} onLayout={(e) => setStripW(e.nativeEvent.layout.width)}>
        <GestureDetector gesture={stripDoubleTap}>
        <View collapsable={false}>
        <DayStrip
          offset={offset}
          count={count}
          n={want}
          k={k}
          width={stripW}
          from={from}
          to={to}
          today={today}
          lang={lang}
          kinds={kinds}
          onTarget={onTargetCb}
          onMove={onStripMove}
          onPick={onStripPick}
          onResize={setWant}
          onResizeEnd={onStripResizeEnd}
          nudge={hint === 'days'}
        />
        </View>
        </GestureDetector>
        {!learned ? (
          <AView entering={enter} exiting={exit} layout={layout} className="flex-row items-center justify-center gap-3 pt-2" accessibilityLabel={t('rooster.daysLabel', { n: want })}>
            <Button variant="secondary" size="sm" icon="minus" accessibilityLabel={t('rooster.fewer')} className="w-24" disabled={want <= 1} onPress={() => step(-1)} />
            <Text bold className="w-20 text-center" accessibilityLiveRegion="polite">
              {t('rooster.nDays', { n: want })}
            </Text>
            <Button variant="secondary" size="sm" icon="plus" accessibilityLabel={t('rooster.more')} className="w-24" disabled={want >= MAX_DAYS} onPress={() => step(1)} />
          </AView>
        ) : null}
        {hint === 'days' ? (
          <Tip
            text={t('rooster.hint')}
            ok={t('rooster.hintOk')}
            onOk={() => {
              setHint(null);
              prefs.set('hint.days', true);
            }}
          />
        ) : null}
      </View>
      <AView layout={layout} className="flex-1 flex-row" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width - AXIS_W, h: e.nativeEvent.layout.height })}>
        <View style={{ width: AXIS_W, paddingTop: LABEL_H }}>
          <TimeAxis pxPerHour={pxPerHour} hours={hours} compact zoom={zoom} />
        </View>
        {size.w ? (
          <PerfProfile id="DayGrid">
          <DayGrid
            offset={offset}
            count={count}
            busyWeekends={busyWeekends}
            width={size.w}
            height={size.h}
            from={from}
            to={to}
            start={start}
            want={want}
            zoom={zoom}
            data={data}
            hours={hours}
            today={today}
            nowMin={now}
            view={view}
            compact={size.w / want < 120}
            lang={lang}
            onPressLesson={onPressLesson}
            onPressOverlap={onPressOverlap}
            onPressTogether={onPressTogether}
            onPressNothing={onPressNothing}
            peeks={peeks}
            onPeekOpen={onPeekOpen}
            onTarget={onTargetCb}
            onCount={onCount}
            onDoubleTap={onDoubleTap}
            drag={drag}
            onPickClass={onPickClass}
            onDropClass={onDropClass}
          />
          </PerfProfile>
        ) : null}
        {size.w ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: AXIS_W, top: 0, width: size.w, height: size.h }}>
            <DragLayer drag={drag} lesson={lifted} width={size.w} height={size.h} compact={size.w / want < 120} />
          </View>
        ) : null}
        {zoomed ? (
          // Small and round, over the hours on the left: covers no lesson, moves nothing
          <AView entering={enter} exiting={exit} className="absolute left-0" style={{ top: 0 }}>
            <IconButton icon="zoomOut" filled label={t('rooster.zoomOut')} onPress={() => setZoomed(false)} className="w-9 h-9" />
          </AView>
        ) : null}
        {onward != null && size.w ? (
          <AView
            entering={enter}
            exiting={exit}
            className="absolute items-center justify-center"
            style={{ left: AXIS_W + (firstEmpty * size.w) / want, width: ((visible.length - firstEmpty) * size.w) / want, top: LABEL_H, bottom: 0 }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('rooster.onward', { day: `${weekdayShort(dateAt(onward), lang)} ${dateAt(onward).getDate()}` })}
              onPress={() => moveTo(onward)}
              hitSlop={12}
              className="items-center gap-1 rounded-card bg-surface border-[1.5px] border-line-strong px-2.5 py-2 active:bg-surface-sunken"
            >
              <Icon name="forward" size={22} color="ink" strokeWidth={2} />
              <Text variant="xs" bold tone="ink2">
                {weekdayShort(dateAt(onward), lang).toUpperCase()}
              </Text>
              <Text variant="sm" bold>
                {String(dateAt(onward).getDate())}
              </Text>
            </Pressable>
          </AView>
        ) : null}
        {!showsToday && size.w ? <TodayPill width={size.w + AXIS_W} height={size.h} top={LABEL_H} onPress={onTodayPress} /> : null}
        <SkipToast note={note} onDone={onToastDone} onUndo={onToastUndo} />
        {hint === 'zoom' ? (
          <View className="absolute left-8 right-2" style={{ top: LABEL_H + 4 }}>
            <Tip
              below
              text={t('rooster.zoomHint')}
              ok={t('rooster.hintOk')}
              onOk={() => {
                setHint(null);
                prefs.set('hint.zoom', true);
              }}
            />
          </View>
        ) : null}
      </AView>
      <AView layout={layout}>
        <Legend items={legend} />
      </AView>
      <OverlapSheet choice={choose} onClose={closeChoice} onPick={pickChoice} peek={peekOverlap} peeking={peeking === 'overlap'} />
      <BreakSheet target={ask} onClose={closeAsk} peek={peekAsk} peeking={peeking === 'ask'} />
      <LessonSheet
        lesson={open?.lesson ?? null}
        onClose={closeLesson}
        friends={friends.data}
        together={open?.together}
        onSkip={skipFromSheet}
        onUnskip={unskipFromSheet}
        peek={peekLesson}
        peeking={peeking === 'lesson'}
      />
    </PerfProfile>
  );
});

/** A small dark tip with an arrow, over the content but never the whole screen. */
function Tip({ text, ok, onOk, below }: { text: string; ok: string; onOk: () => void; below?: boolean }) {
  return (
    <AView entering={enter} exiting={exit} className={below ? '' : 'absolute right-0 top-[60px] left-8 z-10'}>
      {!below ? <View className="self-end w-3 h-3 bg-ink rotate-45 mr-6 -mb-1.5" /> : null}
      <View className="bg-ink rounded-card px-4 py-3 flex-row items-center gap-3">
        <Text variant="sm" tone="inverse" className="flex-1">
          {text}
        </Text>
        <Button variant="onYou" size="sm" label={ok} onPress={onOk} />
      </View>
    </AView>
  );
}
