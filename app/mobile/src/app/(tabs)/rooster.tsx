import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useTodays } from '@/api/hooks';
import type { Lesson, Today } from '@/api/types';
import { DayPager } from '@/components/timetable/DayPager';
import { DayStrip } from '@/components/timetable/DayStrip';
import { LessonSheet } from '@/components/timetable/LessonSheet';
import { type Column, dayBlocks, Legend, type LegendItem, lessonKind, TimeAxis, TimeGrid } from '@/components/timetable/Timetable';
import { Button } from '@/components/ui/Button';
import { AView, enter, exit } from '@/components/ui/Motion';
import { Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { type Page, homePage, MAX_DAYS, page as makePage, pageDays, samePage } from '@/lib/days';
import { joinNames } from '@/lib/status';
import { prefs } from '@/lib/storage';
import { addDays, isoDay, monthRange, nowMin, shortDate, weekdayShort } from '@/lib/time';

/** Hours always on screen; a page with earlier or later lessons stretches them. */
const HOURS: [number, number] = [8, 18];
/** Below this the day doesn't fit any more and the grid scrolls up and down. */
const MIN_PX_PER_HOUR = 34;
const LABELS = 22;

export default function RoosterScreen() {
  const { t, lang } = useT();
  const [want, setWant] = useState(3);
  const [page, setPage] = useState<Page>(() => homePage(3));
  const [hint, setHint] = useState(false);
  const [open, setOpen] = useState<{ lesson: Lesson; data?: Today } | null>(null);
  const [height, setHeight] = useState(0);

  // Remember how many days you like to see, and whether you've seen the hint
  useEffect(() => {
    prefs.get('rooster.days', 3).then((n) => {
      const k = Math.max(1, Math.min(MAX_DAYS, n));
      setWant(k);
      setPage(homePage(k));
    });
    prefs.get('hint.days', false).then((seen) => setHint(!seen));
  }, []);

  function resize(n: number) {
    const k = Math.max(1, Math.min(MAX_DAYS, n));
    setWant(k);
    setPage((p) => makePage(p.start, k));
    prefs.set('rooster.days', k);
    if (hint) dismissHint();
  }

  function dismissHint() {
    setHint(false);
    prefs.set('hint.days', true);
  }

  const days = pageDays(page);
  const home = homePage(want);
  const atHome = samePage(page, home) || days.some((d) => isoDay(d) === isoDay(new Date()));
  // The hours this page needs (same cache as the page itself: no extra requests)
  const current = useTodays(days.map(isoDay));
  const stamp = current.map((r) => r.dataUpdatedAt).join();
  const hours = useMemo<[number, number]>(() => {
    let [h0, h1] = HOURS;
    for (const r of current) {
      for (const l of r.data?.me.lessons ?? []) {
        h0 = Math.min(h0, Math.floor(l.start / 60));
        h1 = Math.max(h1, Math.ceil(l.end / 60));
      }
    }
    return [h0, h1];
  }, [stamp]);
  // The legend explains what's on screen (theory and lab always), so it fits on one line
  const legend = useMemo<LegendItem[]>(() => {
    const out = new Set<LegendItem>(['theory', 'lab']);
    for (const r of current) {
      if (r.data?.together.length) out.add('together');
      for (const l of r.data?.me.lessons ?? []) {
        if (l.state === 'exam') out.add('exam');
        else if (l.state === 'cancelled' || l.state === 'removed') out.add('cancelled');
        else out.add(lessonKind(l.course));
      }
    }
    return (['theory', 'lab', 'exam', 'cancelled', 'together'] as LegendItem[]).filter((i) => out.has(i));
  }, [stamp]);
  const fit = height ? (height - LABELS - 12) / (hours[1] - hours[0]) : 44;
  const pxPerHour = Math.max(MIN_PX_PER_HOUR, Math.min(64, fit));
  const compact = want > 2;

  const grid = (
    <View className="flex-row" style={{ height: LABELS + (hours[1] - hours[0]) * pxPerHour + 10 }}>
      <View style={{ paddingTop: LABELS }}>
        <TimeAxis pxPerHour={pxPerHour} hours={hours} compact={compact} />
      </View>
      <DayPager
        page={page}
        want={want}
        onChange={setPage}
        renderPage={(p) => <PageView p={p} hours={hours} pxPerHour={pxPerHour} compact={p.n > 2} onPress={(lesson, data) => setOpen({ lesson, data })} />}
      />
    </View>
  );

  return (
    <Screen
      title={t('tabs.rooster')}
      eyebrow={page.n > 1 ? monthRange(page.start, addDays(page.start, page.n - 1), lang) : shortDate(page.start, lang)}
      right={
        <View className="flex-row gap-2">
          {!atHome ? (
            <AView entering={enter} exiting={exit}>
              <Button variant="tonal" size="sm" label={t('rooster.today')} onPress={() => setPage(home)} />
            </AView>
          ) : null}
          <Button variant="secondary" size="sm" icon="users" label={t('rooster.compareShort')} accessibilityLabel={t('rooster.compare')} onPress={() => router.push('/compare')} />
        </View>
      }
      scroll={false}
      contentClassName="flex-1 gap-3 pb-3"
    >
      {/* Above the grid (zIndex): the first-time hint may hang over it */}
      <View style={{ zIndex: 10, elevation: 10 }}>
        <DayStrip page={page} onPick={(d) => setPage(makePage(d, want))} onResize={resize} lang={lang} nudge={hint} />
        <View className="flex-row items-center justify-center gap-3 pt-2" accessibilityLabel={t('rooster.daysLabel', { n: want })}>
          <Button variant="secondary" size="sm" icon="minus" accessibilityLabel={t('rooster.fewer')} className="w-24" disabled={want <= 1} onPress={() => resize(want - 1)} />
          <Text bold className="w-20 text-center" accessibilityLiveRegion="polite">
            {t('rooster.nDays', { n: want })}
          </Text>
          <Button variant="secondary" size="sm" icon="plus" accessibilityLabel={t('rooster.more')} className="w-24" disabled={want >= MAX_DAYS} onPress={() => resize(want + 1)} />
        </View>
        {hint ? (
          <AView entering={enter} exiting={exit} className="absolute right-0 top-[60px] left-8 z-10">
            <View className="self-end w-3 h-3 bg-ink rotate-45 mr-6 -mb-1.5" />
            <View className="bg-ink rounded-card px-4 py-3 flex-row items-center gap-3">
              <Text variant="sm" tone="inverse" className="flex-1">
                {t('rooster.hint')}
              </Text>
              <Button variant="onYou" size="sm" label={t('rooster.hintOk')} onPress={dismissHint} />
            </View>
          </AView>
        ) : null}
      </View>
      <View className="flex-1" onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
        {fit >= MIN_PX_PER_HOUR ? (
          grid
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>{grid}</ScrollView>
        )}
      </View>
      <Legend items={legend} />
      <LessonSheet lesson={open?.lesson ?? null} onClose={() => setOpen(null)} friends={open?.data?.friends} together={open?.data?.together} />
    </Screen>
  );
}

/** One page: its days side by side, with shared breaks in yellow. Data per day from Today (cached). */
function PageView({ p, hours, pxPerHour, compact, onPress }: { p: Page; hours: [number, number]; pxPerHour: number; compact: boolean; onPress: (l: Lesson, d?: Today) => void }) {
  const { t, lang } = useT();
  const days = pageDays(p);
  const isos = days.map(isoDay);
  const results = useTodays(isos);
  const todayIso = isoDay(new Date());
  const now = nowMin();
  const columns: Column[] = results.map((r, i) => {
    const data = r.data;
    if (!data) return { key: isos[i], blocks: [] };
    const names = new Map(data.friends.map((f) => [f.id, f.display_name]));
    // Overlapping shared breaks become one yellow block, with everyone you share it with
    const slots: { start: number; end: number; ids: number[] }[] = [];
    for (const s of [...data.together].sort((a, b) => a.start - b.start)) {
      const last = slots[slots.length - 1];
      if (last && s.start < last.end) {
        last.end = Math.max(last.end, s.end);
        if (!last.ids.includes(s.id)) last.ids.push(s.id);
      } else {
        slots.push({ start: s.start, end: s.end, ids: [s.id] });
      }
    }
    const together = slots.map((g) => ({
      start: g.start,
      end: g.end,
      label: t('rooster.with', { names: joinNames(g.ids.map((id) => names.get(id) ?? '?'), t('common.and')) }),
    }));
    return { key: isos[i], blocks: dayBlocks(data.me.lessons, together, isos[i] === todayIso ? now : isos[i] < todayIso ? 24 * 60 : null) };
  });
  const loading = results.some((r) => !r.data || (r.data.loading && r.data.me.lessons.length === 0));
  const empty = !loading && results.every((r) => r.data && r.data.me.lessons.length === 0);
  const weekend = days.every((d) => d.getDay() === 0 || d.getDay() === 6);
  return (
    <View>
      <View className="flex-row gap-1" style={{ height: LABELS }}>
        {days.map((d, i) => (
          <Text key={isos[i]} variant="xs" bold tone={isos[i] === todayIso ? 'you' : 'ink2'} className="flex-1 text-center" numberOfLines={1}>
            {p.n > 2 ? `${weekdayShort(d, lang).toLowerCase()} ${d.getDate()}` : shortDate(d, lang)}
          </Text>
        ))}
      </View>
      <TimeGrid
        columns={columns}
        axis={false}
        hours={hours}
        pxPerHour={pxPerHour}
        compact={compact}
        nowMin={isos.includes(todayIso) && p.n === 1 ? now : null}
        onPressLesson={(l) => onPress(l, results[isos.indexOf(l.day)]?.data)}
        onPressTogether={() => router.push('/compare')}
      />
      {loading ? (
        <AView entering={enter} exiting={exit} className="absolute left-0 right-0 flex-row gap-1" style={{ top: LABELS + pxPerHour * 0.5 }} pointerEvents="none">
          {days.map((d) => (
            <View key={isoDay(d)} className="flex-1 gap-2">
              <Skeleton className="h-16 rounded-block" />
              <Skeleton className="h-10 rounded-block" />
              <Skeleton className="h-20 rounded-block" />
            </View>
          ))}
        </AView>
      ) : empty ? (
        <AView entering={enter} className="absolute left-0 right-0 items-center" style={{ top: LABELS + pxPerHour * 2 }} pointerEvents="none">
          <Text tone="ink2" className="text-center">
            {weekend ? t('rooster.emptyWeekend') : p.n > 1 ? t('rooster.emptyDays') : t('rooster.empty')}
          </Text>
        </AView>
      ) : null}
    </View>
  );
}
