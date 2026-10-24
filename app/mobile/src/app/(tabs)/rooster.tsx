import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { FadeInLeft, FadeInRight, FadeOutLeft, FadeOutRight, useSharedValue, withSpring } from 'react-native-reanimated';

import { useFriends, useWeeks } from '@/api/hooks';
import type { Lesson, Together } from '@/api/types';
import { type DayData, DayGrid, LABEL_H, RESIZE, SWIPE } from '@/components/timetable/DayGrid';
import { BreakSheet, type BreakTarget } from '@/components/BreakSheet';
import { DayStrip } from '@/components/timetable/DayStrip';
import { LessonSheet, OverlapSheet } from '@/components/timetable/LessonSheet';
import { kindsOf, Legend, type LegendItem, lessonKind, TimeAxis } from '@/components/timetable/Timetable';
import { TodayPill } from '@/components/timetable/TodayPill';
import { Button, IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { APressable, AView, enter, exit, layout, usePressScale } from '@/components/ui/Motion';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { type Lang, useT } from '@/i18n';
import { dateAt, dayIndex, homeStart, MAX_DAYS, mondayOf, weekdayOf } from '@/lib/days';
import { joinNames } from '@/lib/status';
import { prefs } from '@/lib/storage';
import { isoDay, nowMin } from '@/lib/time';

/** Hours always on screen; earlier or later lessons stretch them. */
const HOURS: [number, number] = [8, 18];
const AXIS_W = 30;

/** "19 – 23 okt", "28 okt – 3 nov", "di 20 okt": always short enough for one line. */
function rangeLabel(a: Date, b: Date, lang: Lang) {
  const loc = lang === 'nl' ? 'nl-BE' : 'en-GB';
  const m = (d: Date) => d.toLocaleDateString(loc, { month: 'short' }).replace('.', '');
  if (a.getTime() === b.getTime()) return d1(a, loc);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${m(b)}`;
  return `${a.getDate()} ${m(a)} – ${b.getDate()} ${m(b)}`;
}
const d1 = (d: Date, loc: string) => d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Rooster: your days side by side (1–7), scrolled continuously day by day, as far back or ahead as you like.
 * The week strip on top, the grid's columns and their widths share the same animated values (offset, count),
 * so they move together in the same frame. Data comes a week at a time and only the columns wait for it;
 * dates are there before you land.
 */
export default function RoosterScreen() {
  const { t, lang } = useT();
  const friends = useFriends();
  const today = dayIndex(new Date());
  const [want, setWant] = useState(5);
  const [start, setStart] = useState(() => homeStart(5, today, () => true));
  const [enterFrom, setEnterFrom] = useState<1 | -1>(1);
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
  const stamp = weeks.map((w) => w.dataUpdatedAt).join();
  const names = useMemo(() => new Map((friends.data ?? []).map((f) => [f.id, f.display_name])), [friends.data]);
  const byDay = useMemo(() => {
    const out = new Map<number, DayData & { raw: Together[] }>();
    weeks.forEach((w, wi) => {
      const monday = mondayOf(from) + wi * 7;
      for (let d = 0; d < 7; d++) {
        const iso = isoDay(dateAt(monday + d));
        const raw = w.data?.together?.[iso] ?? [];
        // Overlapping shared breaks become one yellow block, with everyone you share it with
        const slots: { start: number; end: number; ids: number[] }[] = [];
        for (const s of [...raw].sort((a, b) => a.start - b.start)) {
          const lastSlot = slots[slots.length - 1];
          if (lastSlot && s.start < lastSlot.end) {
            lastSlot.end = Math.max(lastSlot.end, s.end);
            if (!lastSlot.ids.includes(s.id)) lastSlot.ids.push(s.id);
          } else slots.push({ start: s.start, end: s.end, ids: [s.id] });
        }
        out.set(monday + d, {
          lessons: (w.data?.lessons ?? []).filter((l) => l.day === iso),
          together: slots.map((g) => ({ start: g.start, end: g.end, label: t('rooster.with', { names: joinNames(g.ids.map((id) => names.get(id) ?? '?'), t('common.and')) }) })),
          loading: !w.data || !!w.data.loading,
          raw,
        });
      }
    });
    return out;
  }, [stamp, names, from]);

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
  const kinds = useMemo(() => new Map([...byDay].map(([day, d]) => [day, kindsOf(d.lessons)])), [byDay]);

  // Remember how many days you like; without a choice: 5, or 7 when this week's weekend has something on it
  useEffect(() => {
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
    if (!chosen.current && weekendBusy && want === 5) moveTo(mondayOf(today), 7, false);
  }, [weekendBusy]);

  /** Go to a view: the grid slides there (from the side you came from), the strip follows. */
  function moveTo(target: number, n = want, animate = true) {
    setEnterFrom(target >= start ? 1 : -1);
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
    setEnterFrom(target >= start ? 1 : -1);
    setStart(target);
    k.set(withSpring(Math.min(weekdayOf(target), 7 - want), SWIPE));
  }

  function setDays(n: number, viaHandle: boolean) {
    const m = Math.max(1, Math.min(MAX_DAYS, n));
    chosen.current = true;
    setWant(m);
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

  /** A shared break tapped: "Pauze samen?" with everyone in it, each with their own free window (today from now
   * on). A day that's over only shows the comparison. */
  function askBreak(day: number, span: { start: number; end: number }) {
    const byId = new Map((friends.data ?? []).map((f) => [f.id, f]));
    const now = day === today ? nowMin() : 0;
    const people = (byDay.get(day)?.raw ?? [])
      .filter((s) => s.start < span.end && span.start < s.end && s.end > now && byId.has(s.id))
      .filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i)
      .map((s) => ({ ...byId.get(s.id)!, start: Math.max(s.start, now), end: s.end }));
    if (day < today || !people.length) router.push('/compare');
    else setAsk({ kind: 'ask', day: isoDay(dateAt(day)), people });
  }

  /** Back to the standard view: this week, Monday to Friday, zoomed out (also remembered: 5 days). */
  function reset() {
    setZoomed(false);
    setDays(5, false);
    moveTo(homeStart(5, today, emptyWeekend), 5);
  }

  const visible = Array.from({ length: want }, (_, i) => start + i);
  const home = homeStart(want, today, emptyWeekend);
  // 'Vandaag' only when you've moved away from today (and from where the tab opens)
  const showsToday = visible.includes(today) || start === home;
  const hours = useMemo<[number, number]>(() => {
    const ls = visible.flatMap((d) => byDay.get(d)?.lessons ?? []);
    if (zoomed && ls.length) {
      const a = Math.floor(Math.min(...ls.map((l) => l.start)) / 60);
      const b = Math.ceil(Math.max(...ls.map((l) => l.end)) / 60);
      return [a, Math.max(b, a + 2)];
    }
    let [h0, h1] = HOURS;
    for (const l of ls) {
      h0 = Math.min(h0, Math.floor(l.start / 60));
      h1 = Math.max(h1, Math.ceil(l.end / 60));
    }
    return [h0, h1];
  }, [zoomed, stamp, start, want]);
  const legend = useMemo<LegendItem[]>(() => {
    const out = new Set<LegendItem>();
    for (const d of visible) {
      const day = byDay.get(d);
      if (day?.together.length) out.add('together');
      for (const l of day?.lessons ?? []) out.add(l.state === 'cancelled' || l.state === 'removed' ? 'cancelled' : lessonKind(l));
    }
    return [...out];
  }, [stamp, start, want]);
  // Anything else than the standard view (zoomed, other than 5 days, not starting on a Monday): the title becomes 'Terug'
  const custom = zoomed || want !== 5 || weekdayOf(start) !== 0;
  const pxPerHour = size.h ? (size.h - LABEL_H) / (hours[1] - hours[0]) : 40;

  return (
    <Screen
      title={t('tabs.rooster')}
      heading={<TitleOrBack title={t('tabs.rooster')} back={custom ? t('common.back') : null} hint={t('rooster.resetHint')} onBack={reset} />}
      eyebrow={rangeLabel(dateAt(start), dateAt(start + want - 1), lang)}
      right={<Button variant="secondary" size="sm" icon="users" label={t('rooster.compareShort')} accessibilityLabel={t('rooster.compare')} onPress={() => router.push('/compare')} />}
      scroll={false}
      contentClassName="flex-1 gap-2 pb-3"
    >
      {/* Above the grid (zIndex): tips may hang over it */}
      <View style={{ zIndex: 10, elevation: 10 }} onLayout={(e) => setStripW(e.nativeEvent.layout.width)}>
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
          busyWeekends={busyWeekends}
          kinds={(day) => kinds.get(day) ?? []}
          onTarget={onTarget}
          onPick={(day) => moveTo(want >= 5 ? Math.max(mondayOf(day), Math.min(day, mondayOf(day) + 7 - want)) : day)}
          onResize={(n) => setWant(n)}
          onResizeEnd={(n, s) => {
            if (s !== undefined && s !== start) {
              setEnterFrom(s >= start ? 1 : -1);
              setStart(s);
            }
            setDays(n, true);
          }}
          nudge={hint === 'days'}
        />
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
          <Tip text={t('rooster.hint')} ok={t('rooster.hintOk')} onOk={() => { setHint(null); prefs.set('hint.days', true); }} />
        ) : null}
      </View>
      <AView layout={layout} className="flex-1 flex-row" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width - AXIS_W, h: e.nativeEvent.layout.height })}>
        <View style={{ width: AXIS_W, paddingTop: LABEL_H }}>
          <TimeAxis pxPerHour={pxPerHour} hours={hours} compact />
        </View>
        {size.w ? (
          <DayGrid
            offset={offset}
            count={count}
            busyWeekends={busyWeekends}
            width={size.w}
            height={size.h}
            from={from}
            to={to}
            data={(d) => byDay.get(d)}
            hours={hours}
            today={today}
            nowMin={nowMin()}
            enterFrom={enterFrom}
            compact={size.w / want < 120}
            lang={lang}
            onPressLesson={(lesson, day) => setOpen({ lesson, together: byDay.get(day)?.raw ?? [] })}
            onPressOverlap={(lessons, day) => setChoose({ lessons, day })}
            onPressTogether={askBreak}
            onTarget={onTarget}
            onCount={(n, s) => {
              setStart(s);
              k.set(withSpring(Math.min(weekdayOf(s), 7 - n), RESIZE));
              setDays(n, false);
            }}
            onDoubleTap={() => setZoomed((z) => !z)}
          />
        ) : null}
        {zoomed ? (
          // Small and round, over the hours on the left: covers no lesson, moves nothing
          <AView entering={enter} exiting={exit} className="absolute left-0" style={{ top: 0 }}>
            <IconButton icon="zoomOut" filled label={t('rooster.zoomOut')} onPress={() => setZoomed(false)} className="w-9 h-9" />
          </AView>
        ) : null}
        {!showsToday && size.w ? <TodayPill width={size.w + AXIS_W} height={size.h} top={LABEL_H} onPress={() => moveTo(home)} /> : null}
        {hint === 'zoom' ? (
          <View className="absolute left-8 right-2" style={{ top: LABEL_H + 4 }}>
            <Tip below text={t('rooster.zoomHint')} ok={t('rooster.hintOk')} onOk={() => { setHint(null); prefs.set('hint.zoom', true); }} />
          </View>
        ) : null}
      </AView>
      <AView layout={layout}>
        <Legend items={legend.length ? legend : ['theory', 'lab']} />
      </AView>
      <OverlapSheet
        choice={choose}
        onClose={() => setChoose(null)}
        onPick={(lesson) => {
          const day = choose?.day ?? today;
          setChoose(null);
          // One sheet at a time: the next opens once this one is on its way out
          setTimeout(() => setOpen({ lesson, together: byDay.get(day)?.raw ?? [] }), 220);
        }}
      />
      <BreakSheet target={ask} onClose={() => setAsk(null)} />
      <LessonSheet lesson={open?.lesson ?? null} onClose={() => setOpen(null)} friends={friends.data} together={open?.together} />
    </Screen>
  );
}

/**
 * The large title, or 'Terug' (the arrow curling left) once you've changed the view: the one slides out as the
 * other slides in, in the same place. 'Terug' goes back to the standard view.
 */
function TitleOrBack({ title, back, hint, onBack }: { title: string; back: string | null; hint: string; onBack: () => void }) {
  const press = usePressScale();
  return (
    <View className="flex-shrink min-h-11 justify-end">
      {back ? (
        <APressable
          key="back"
          entering={FadeInRight.duration(220)}
          exiting={FadeOutRight.duration(160)}
          accessibilityRole="button"
          accessibilityLabel={back}
          accessibilityHint={hint}
          hitSlop={8}
          onPress={onBack}
          {...press.handlers}
          style={press.style}
          className="flex-row items-center gap-1.5"
        >
          <Icon name="undo" size={26} color="you-ink" strokeWidth={2} />
          <Text variant="title" tone="you" numberOfLines={1}>
            {back}
          </Text>
        </APressable>
      ) : (
        <AView key="title" entering={FadeInLeft.duration(220)} exiting={FadeOutLeft.duration(160)}>
          <Text variant="title" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
        </AView>
      )}
    </View>
  );
}

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
