import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useFriends, useSchedule, useTodays } from '@/api/hooks';
import type { Lesson, Today } from '@/api/types';
import { LessonSheet } from '@/components/timetable/LessonSheet';
import { type Column, dayBlocks, Legend, TimeGrid } from '@/components/timetable/Timetable';
import { WeekView } from '@/components/timetable/WeekView';
import { Segmented } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Layout';
import { Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { joinNames } from '@/lib/status';
import { addDays, isoDay, monday, monthRange, nowMin, shortDate, weekdayShort } from '@/lib/time';

type Mode = 'day' | 'week';

/** Monday–Friday only: skip the weekend when stepping through days. */
function schoolDay(d: Date, dir: 1 | -1 = 1) {
  let x = d;
  while ([0, 6].includes(x.getDay())) x = addDays(x, dir);
  return x;
}

export default function RoosterScreen() {
  const { t, lang } = useT();
  const [mode, setMode] = useState<Mode>('day');
  const [day, setDay] = useState(() => schoolDay(new Date()));
  const [count, setCount] = useState(1);
  const [open, setOpen] = useState<{ lesson: Lesson; data?: Today } | null>(null);
  const friends = useFriends();

  const days = useMemo(() => {
    const out: Date[] = [];
    let d = day;
    while (out.length < count) {
      out.push(d);
      d = schoolDay(addDays(d, 1));
    }
    return out;
  }, [day, count]);
  const week = monday(day);

  return (
    <Screen
      title={t('tabs.rooster')}
      eyebrow={mode === 'week' ? monthRange(week, addDays(week, 4), lang) : shortDate(day, lang)}
      right={
        <Button
          variant="secondary"
          size="sm"
          label={t('rooster.compare')}
          onPress={() => router.push('/compare')}
          icon={friends.data?.length ? undefined : 'users'}
        />
      }
    >
      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'day', label: t('rooster.day') },
          { value: 'week', label: t('rooster.week') },
        ]}
      />
      {mode === 'day' ? (
        <>
          <DayPicker day={day} onPick={setDay} lang={lang} t={t} />
          <DayColumns days={days} onPress={(lesson, data) => setOpen({ lesson, data })} />
          <Legend items={['theory', 'lab', 'cancelled', 'together']} />
          <View className="flex-row items-center gap-2 self-start" accessibilityLabel={t('rooster.daysLabel', { n: count })}>
            <Text variant="sm" bold tone="ink2">
              {t('rooster.days')}
            </Text>
            <IconButton icon="minus" filled label={t('rooster.fewer')} disabled={count <= 1} onPress={() => setCount((c) => Math.max(1, c - 1))} />
            <Text bold className="w-6 text-center">
              {count}
            </Text>
            <IconButton icon="plus" filled label={t('rooster.more')} disabled={count >= 3} onPress={() => setCount((c) => Math.min(3, c + 1))} />
          </View>
        </>
      ) : (
        <Week start={week} onWeek={(d) => setDay(schoolDay(d))} onPress={(lesson) => setOpen({ lesson })} t={t} lang={lang} />
      )}
      <LessonSheet lesson={open?.lesson ?? null} onClose={() => setOpen(null)} friends={open?.data?.friends} together={open?.data?.together} />
    </Screen>
  );
}

type T = ReturnType<typeof useT>['t'];

/** Ma 19 · Di 20 · ... with arrows to the previous / next week. */
function DayPicker({ day, onPick, lang, t }: { day: Date; onPick: (d: Date) => void; lang: 'nl' | 'en'; t: T }) {
  const start = monday(day);
  const todayIso = isoDay(new Date());
  return (
    <View className="flex-row items-center gap-1">
      <IconButton icon="back" label={t('rooster.prevWeek')} onPress={() => onPick(addDays(start, -7))} />
      {Array.from({ length: 5 }, (_, i) => addDays(start, i)).map((d) => {
        const on = isoDay(d) === isoDay(day);
        const today = isoDay(d) === todayIso;
        return (
          <Pressable
            key={isoDay(d)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={shortDate(d, lang)}
            onPress={() => onPick(d)}
            className={cn('flex-1 items-center py-1.5 rounded-chip min-h-12 justify-center', on ? 'bg-ink' : today ? 'bg-you-soft' : '')}
          >
            <Text variant="xs" bold tone={on ? 'inverse' : 'ink2'}>
              {weekdayShort(d, lang)}
            </Text>
            <Text bold tone={on ? 'inverse' : 'ink'}>
              {d.getDate()}
            </Text>
          </Pressable>
        );
      })}
      <IconButton icon="forward" label={t('rooster.nextWeek')} onPress={() => onPick(addDays(start, 7))} />
    </View>
  );
}

/** 1–3 days side by side, with shared breaks in yellow. */
function DayColumns({ days, onPress }: { days: Date[]; onPress: (l: Lesson, d?: Today) => void }) {
  const { t, lang } = useT();
  const isos = days.map(isoDay);
  const results = useTodays(isos);
  const todayIso = isoDay(new Date());
  const now = nowMin();
  if (results.every((r) => !r.data)) {
    return (
      <Card className="p-4 gap-3 h-64">
        <Skeleton width={200} />
        <Skeleton width={140} />
      </Card>
    );
  }
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
    return {
      key: isos[i],
      label: days.length > 1 ? shortDate(days[i], lang) : undefined,
      blocks: dayBlocks(data.me.lessons, together, isos[i] === todayIso ? now : isos[i] < todayIso ? 24 * 60 : null),
    };
  });
  const showNow = isos.includes(todayIso) && days.length === 1;
  return (
    <View className="gap-1.5">
      {days.length > 1 ? (
        <View className="flex-row gap-1" style={{ paddingLeft: 44 }}>
          {columns.map((c) => (
            <Text key={c.key} variant="xs" bold tone="ink2" className="flex-1 text-center">
              {c.label}
            </Text>
          ))}
        </View>
      ) : null}
      <TimeGrid
        columns={columns}
        nowMin={showNow ? now : null}
        compact={days.length > 2}
        onPressLesson={(l) => onPress(l, results[isos.indexOf(l.day)]?.data)}
        onPressTogether={() => router.push('/compare')}
      />
      {results.every((r) => r.data && r.data.me.lessons.length === 0) ? (
        <Text tone="ink2" className="text-center">
          {t('rooster.empty')}
        </Text>
      ) : null}
    </View>
  );
}

function Week({ start, onWeek, onPress, t, lang }: { start: Date; onWeek: (d: Date) => void; onPress: (l: Lesson) => void; t: T; lang: 'nl' | 'en' }) {
  const schedule = useSchedule(isoDay(start), 5);
  const lessons = schedule.data?.lessons ?? [];
  return (
    <>
      <View className="flex-row items-center justify-between">
        <IconButton icon="back" label={t('rooster.prevWeek')} onPress={() => onWeek(addDays(start, -7))} />
        <Text bold>{monthRange(start, addDays(start, 4), lang)}</Text>
        <IconButton icon="forward" label={t('rooster.nextWeek')} onPress={() => onWeek(addDays(start, 7))} />
      </View>
      {schedule.data ? (
        <WeekView monday={start} lessons={lessons} todayIso={isoDay(new Date())} nowMin={nowMin()} onPressLesson={onPress} />
      ) : (
        <Card className="p-4 gap-3 h-64">
          <Skeleton width={200} />
        </Card>
      )}
      <Legend items={['theory', 'lab', 'cancelled', 'exam']} />
      {schedule.data && lessons.length === 0 ? (
        <Text tone="ink2" className="text-center">
          {t('rooster.emptyWeek')}
        </Text>
      ) : null}
    </>
  );
}
