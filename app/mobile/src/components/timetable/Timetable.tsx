import { Pressable, View } from 'react-native';

import type { Lesson } from '@/api/types';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useT, type Key } from '@/i18n';
import { cn } from '@/lib/cn';
import { hhmm } from '@/lib/time';

/** Theory or lab? Untis doesn't say it directly; most schools put it in the course name. */
export function lessonKind(course?: string): 'theory' | 'lab' {
  return /\b(labo|lab|practicum|werkcollege|oefen|workshop)/i.test(course ?? '') ? 'lab' : 'theory';
}

export function isOff(l: Lesson) {
  return l.state === 'cancelled' || l.state === 'removed';
}

export type Span = { start: number; end: number };

type Block =
  | { type: 'lesson'; lesson: Lesson; past: boolean }
  | { type: 'together'; span: Span; label: string }
  | { type: 'friend'; span: Span }
  | { type: 'free'; span: Span; label?: string };

export type Column = { key: string; label?: string; blocks: Block[] };

export const START_HOUR = 8;
export const END_HOUR = 19;
/** Two lessons of the same course at most this many minutes apart show as one block (a double period). */
export const MERGE_GAP = 15;

/** Back-to-back lessons of the same course, room and state become one block: 11:00–12:00 + 12:00–13:00
 * shows as 11:00–13:00. Lessons may be of several days; the order of the result is by day and start. */
export function mergeLessons(lessons: Lesson[]): Lesson[] {
  const out: Lesson[] = [];
  const sorted = [...lessons].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.start - b.start || a.end - b.end));
  for (const l of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.day === l.day &&
      prev.course !== undefined &&
      prev.course === l.course &&
      (prev.location ?? null) === (l.location ?? null) &&
      prev.state === l.state &&
      prev.busy === l.busy &&
      l.start >= prev.start &&
      l.start - prev.end <= MERGE_GAP
    ) {
      out[out.length - 1] = { ...prev, end: Math.max(prev.end, l.end), recently_changed: prev.recently_changed || l.recently_changed };
    } else {
      out.push(l);
    }
  }
  return out;
}

/** Lessons + shared breaks of one day as blocks for a column. */
export function dayBlocks(lessons: Lesson[], together: (Span & { label: string })[], nowMin: number | null): Block[] {
  return [
    ...mergeLessons(lessons).map((l) => ({ type: 'lesson' as const, lesson: l, past: nowMin != null && l.end <= nowMin })),
    ...together.map((s) => ({ type: 'together' as const, span: { start: s.start, end: s.end }, label: s.label })),
  ];
}

function spanOf(b: Block): Span {
  return b.type === 'lesson' ? { start: b.lesson.start, end: b.lesson.end } : b.span;
}

function overlaps(a: Span, b: Span) {
  return a.start < b.end && b.start < a.end;
}

function lessonLabel(l: Lesson, t: (k: Key, p?: Record<string, string | number>) => string) {
  const parts = [l.course ?? t('tt.busy'), `${hhmm(l.start)} ${t('tt.to')} ${hhmm(l.end)}`];
  if (l.location) parts.push(l.location);
  if (isOff(l)) parts.push(t('tt.cancelled'));
  else if (l.state === 'changed') parts.push(t('tt.changed'));
  else if (l.state === 'exam') parts.push(t('tt.exam'));
  return parts.join(', ');
}

type GridProps = {
  columns: Column[];
  pxPerHour?: number;
  nowMin?: number | null;
  compact?: boolean;
  onPressLesson?: (l: Lesson) => void;
  onPressTogether?: (s: Span) => void;
  hours?: [number, number];
};

/** Time axis on the left, one or more day columns, a "now" line. */
export function TimeGrid({ columns, pxPerHour = 48, nowMin, compact, onPressLesson, onPressTogether, hours = [START_HOUR, END_HOUR] }: GridProps) {
  const { t } = useT();
  const [h0, h1] = hours;
  const height = (h1 - h0) * pxPerHour;
  const y = (min: number) => ((min - h0 * 60) / 60) * pxPerHour;
  const axisW = compact ? 24 : 44;
  return (
    <View className="flex-row" style={{ height: height + 10 }}>
      <View style={{ width: axisW, height }}>
        {Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i)
          .filter((h) => !compact || (h - h0) % 2 === 0)
          .map((h) => (
            <Text key={h} variant="xs" bold tone="ink3" className="absolute" style={{ top: (h - h0) * pxPerHour - 9, fontSize: compact ? 11 : 12 }}>
              {compact ? String(h) : `${String(h).padStart(2, '0')}:00`}
            </Text>
          ))}
      </View>
      <View className="flex-1 flex-row gap-1" style={{ height }}>
        {!compact &&
          Array.from({ length: h1 - h0 + 1 }, (_, i) => (
            <View key={i} className="absolute left-0 right-0 h-px bg-line" style={{ top: i * pxPerHour }} />
          ))}
        {columns.map((col) => (
          <View key={col.key} className="flex-1" style={{ height }}>
            {col.blocks.map((b, i) => {
              const s = spanOf(b);
              const top = y(Math.max(s.start, h0 * 60));
              const h = Math.max(y(Math.min(s.end, h1 * 60)) - top - 3, 18);
              // A shared break during a cancelled lesson: both get half the width
              const sharesWithOther = col.blocks.some((o, j) => j !== i && overlaps(spanOf(o), s) && ((b.type === 'together' && o.type === 'lesson' && isOff(o.lesson)) || (b.type === 'lesson' && isOff(b.lesson) && o.type === 'together')));
              const pos = sharesWithOther ? (b.type === 'together' ? { left: '55%' as const, right: 0 } : { left: 0, right: '47%' as const }) : { left: 0, right: 0 };
              return <BlockView key={i} block={b} style={{ position: 'absolute', top, height: h, ...pos }} compact={compact} onPressLesson={onPressLesson} onPressTogether={onPressTogether} t={t} />;
            })}
          </View>
        ))}
        {nowMin != null && nowMin >= h0 * 60 && nowMin <= h1 * 60 ? (
          <View className="absolute left-0 right-0 h-0.5 bg-ink" style={{ top: y(nowMin) }} pointerEvents="none">
            <View className="absolute bg-ink rounded px-1" style={{ left: -axisW, top: -10 }}>
              <Text variant="xs" bold tone="inverse" style={{ fontSize: 12 }}>
                {hhmm(nowMin)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function BlockView({ block, style, compact, onPressLesson, onPressTogether, t }: { block: Block; style: object; compact?: boolean; onPressLesson?: (l: Lesson) => void; onPressTogether?: (s: Span) => void; t: (k: Key, p?: Record<string, string | number>) => string }) {
  const pad = compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5';
  if (block.type === 'together') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('tt.together')} ${block.label}, ${hhmm(block.span.start)} ${t('tt.to')} ${hhmm(block.span.end)}`}
        onPress={onPressTogether ? () => onPressTogether(block.span) : undefined}
        className={cn('rounded-block bg-together overflow-hidden', pad, compact && 'items-center justify-center')}
        style={style}
      >
        <View className="flex-row items-center gap-1">
          <Icon name="together" size={15} color="#161F2A" strokeWidth={2} />
          {!compact ? (
            <Text variant="sm" bold tone="onTogether">
              {t('tt.together')}
            </Text>
          ) : null}
        </View>
        {!compact && block.label ? (
          <Text variant="xs" tone="onTogether" numberOfLines={1}>
            {block.label}
          </Text>
        ) : null}
      </Pressable>
    );
  }
  if (block.type === 'friend') {
    return (
      <View className={cn('rounded-[6px] bg-friend-soft border-[1.5px] border-friend', pad)} style={style}>
        <Text variant="xs" bold>
          {t('tt.lesson')}
        </Text>
      </View>
    );
  }
  if (block.type === 'free') {
    return (
      <View className={cn('rounded-[6px] border-[1.5px] border-dashed border-line-strong', pad)} style={style}>
        <Text variant="xs" bold tone="ink3">
          {t('tt.free')}
        </Text>
        {block.label ? (
          <Text variant="xs" tone="ink3" numberOfLines={1}>
            {block.label}
          </Text>
        ) : null}
      </View>
    );
  }
  const l = block.lesson;
  const off = isOff(l);
  const kind = lessonKind(l.course);
  const exam = l.state === 'exam';
  const cls = cn(
    compact ? 'rounded-[6px]' : 'rounded-block',
    'overflow-hidden',
    pad,
    off
      ? 'bg-surface border-[1.5px] border-dashed border-danger'
      : exam
        ? 'bg-ink'
        : l.course === undefined
          ? 'bg-friend-soft border-[1.5px] border-friend'
          : kind === 'lab'
            ? 'bg-lab-soft border-[1.5px] border-lab'
            : 'bg-theory-soft border-[1.5px] border-theory',
    l.state === 'changed' && 'border-ink',
    l.state === 'extra' && 'border-[2.5px]',
    block.past && 'opacity-55',
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lessonLabel(l, t)}
      onPress={onPressLesson ? () => onPressLesson(l) : undefined}
      className={cls}
      style={style}
    >
      {l.course === undefined ? (
        <Text variant="xs" bold>
          {t('tt.lesson')}
        </Text>
      ) : (
        <>
          <View className="flex-row items-center justify-between gap-1">
            <Text variant={compact ? 'xs' : 'sm'} bold strike={off} tone={exam ? 'inverse' : off ? 'ink2' : 'ink'} numberOfLines={compact ? 2 : 1} className="flex-1">
              {compact ? shortCourse(l.course) : l.course}
            </Text>
            {!compact && l.state === 'changed' ? (
              <View className="bg-ink rounded-md px-1.5">
                <Text variant="xs" bold tone="inverse">
                  {t('tt.changed')}
                </Text>
              </View>
            ) : null}
          </View>
          {off ? (
            <Text variant="xs" bold tone="danger">
              {t('tt.cancelled')}
            </Text>
          ) : (
            <Text variant="xs" tone={exam ? 'inverse' : 'ink'} numberOfLines={1}>
              {exam ? t('tt.exam') : compact ? (l.location ?? '') : [t(kind === 'lab' ? 'tt.lab' : 'tt.theory'), l.location].filter(Boolean).join(' · ')}
            </Text>
          )}
        </>
      )}
    </Pressable>
  );
}

/** Short enough for a week column: "Network Security" -> "NetSec", "Python Advanced Labo" -> "Python". */
export function shortCourse(name: string) {
  const words = name.split(/\s+/).filter((w) => w && !/^(labo|lab|theorie|theory|practicum|wpl|hc|wc|\(.*\))$/i.test(w));
  if (words.length === 0) return name;
  const [first, second] = words;
  if (first.length <= 6) return first;
  if (second) return first.slice(0, 3) + second.charAt(0).toUpperCase() + second.slice(1, 3);
  return `${first.slice(0, 5)}.`;
}

export function Legend({ items }: { items: ('theory' | 'lab' | 'cancelled' | 'together' | 'friend' | 'exam')[] }) {
  const { t } = useT();
  const sw: Record<string, string> = {
    theory: 'bg-theory-soft border-[1.5px] border-theory',
    lab: 'bg-lab-soft border-[1.5px] border-lab',
    cancelled: 'border-[1.5px] border-dashed border-danger',
    together: 'bg-together',
    friend: 'bg-friend-soft border-[1.5px] border-friend',
    exam: 'bg-ink',
  };
  const label: Record<string, Key> = {
    theory: 'tt.theory',
    lab: 'tt.lab',
    cancelled: 'tt.cancelled',
    together: 'tt.together',
    friend: 'tt.friendLesson',
    exam: 'tt.exam',
  };
  return (
    <View className="flex-row flex-wrap gap-x-3.5 gap-y-1.5" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {items.map((i) => (
        <View key={i} className="flex-row items-center gap-1.5">
          <View className={cn('w-4 h-3 rounded-[3px]', sw[i])} />
          <Text variant="xs" bold tone="ink2">
            {t(label[i])}
          </Text>
        </View>
      ))}
    </View>
  );
}
