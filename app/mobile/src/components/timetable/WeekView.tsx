import { View } from 'react-native';

import type { Lesson } from '@/api/types';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { addDays, isoDay, weekdayShort } from '@/lib/time';

import { type Column, mergeLessons, TimeGrid } from './Timetable';

/** Five day columns (Mon–Fri) with compact blocks. `dim` fades lessons (default: the ones that are over). */
export function WeekView({ monday, lessons, todayIso, nowMin, onPressLesson, pxPerHour = 40, dim }: { monday: Date; lessons: Lesson[]; todayIso: string; nowMin: number | null; onPressLesson?: (l: Lesson) => void; pxPerHour?: number; dim?: (l: Lesson) => boolean }) {
  const { lang } = useT();
  const days = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  const merged = mergeLessons(lessons);
  const columns: Column[] = days.map((d) => {
    const iso = isoDay(d);
    return {
      key: iso,
      blocks: merged.filter((l) => l.day === iso).map((l) => ({ type: 'lesson' as const, lesson: l, past: dim ? dim(l) : iso < todayIso || (iso === todayIso && nowMin != null && l.end <= nowMin) })),
    };
  });
  return (
    <View className="gap-1.5">
      <View className="flex-row gap-1" style={{ paddingLeft: 24 }}>
        {days.map((d) => {
          const today = isoDay(d) === todayIso;
          return (
            <View key={isoDay(d)} className={cn('flex-1 items-center py-1.5 rounded-md', today && 'bg-ink')}>
              <Text variant="xs" bold tone={today ? 'inverse' : 'ink2'}>
                {weekdayShort(d, lang)} {today ? d.getDate() : ''}
              </Text>
            </View>
          );
        })}
      </View>
      <TimeGrid columns={columns} compact pxPerHour={pxPerHour} nowMin={null} onPressLesson={onPressLesson} />
    </View>
  );
}
