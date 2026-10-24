import type { ReactNode } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import type { Lesson } from '@/api/types';
import { Icon } from '@/components/ui/Icon';
import { AView, layout } from '@/components/ui/Motion';
import { Text } from '@/components/ui/Text';
import { useT, type Key } from '@/i18n';
import { cn } from '@/lib/cn';
import { hhmm } from '@/lib/time';

/** The kinds of lessons the API tells apart (api/roosters/kinds.py), each with its own colour. */
export type LessonKind = 'theory' | 'lab' | 'exercises' | 'project' | 'support' | 'internship' | 'info' | 'exam' | 'other';

/** The lesson's kind from the API; lessons cached before it had kinds: a guess from the course name. */
export function lessonKind(l: { kind?: string; course?: string; state?: string }): LessonKind {
  if (l.state === 'exam') return 'exam';
  if (l.kind && l.kind !== 'other') return l.kind as LessonKind;
  if (/\b(labo|lab|practicum)/i.test(l.course ?? '')) return 'lab';
  return l.kind ? 'other' : 'theory';
}

/** Block colours per kind: soft fill and a stronger border (tokens in global.css). */
export const KIND_STYLE: Record<LessonKind, string> = {
  theory: 'bg-theory-soft border-theory',
  lab: 'bg-lab-soft border-lab',
  exercises: 'bg-exercises-soft border-exercises',
  project: 'bg-project-soft border-project',
  support: 'bg-support-soft border-support',
  internship: 'bg-internship-soft border-internship',
  info: 'bg-info-soft border-info',
  exam: 'bg-ink border-ink',
  other: 'bg-other-soft border-other',
};

/** The small dot per kind under a date in the week strip: the kind's strong colour. */
export const KIND_DOT: Record<LessonKind, string> = {
  theory: 'bg-theory',
  lab: 'bg-lab',
  exercises: 'bg-exercises',
  project: 'bg-project',
  support: 'bg-support',
  internship: 'bg-internship',
  info: 'bg-info',
  exam: 'bg-ink',
  other: 'bg-other',
};

/** The kinds of a day's lessons that take place (cancelled ones don't count), in the order they come. */
export function kindsOf(lessons: Lesson[]): LessonKind[] {
  const out: LessonKind[] = [];
  for (const l of [...lessons].sort((a, b) => a.start - b.start)) {
    const k = lessonKind(l);
    if (!isFree(l) && !out.includes(k)) out.push(k);
  }
  return out;
}

export const KIND_LABEL: Record<LessonKind, Key> = {
  theory: 'tt.theory',
  lab: 'tt.lab',
  exercises: 'tt.exercises',
  project: 'tt.project',
  support: 'tt.support',
  internship: 'tt.internship',
  info: 'tt.info',
  exam: 'tt.exam',
  other: 'tt.lesson',
};

export function isOff(l: Lesson) {
  return l.state === 'cancelled' || l.state === 'removed';
}

/** A lesson that doesn't keep you busy: cancelled, or one you skip (see lib/skips.ts). Its time is free. */
export function isFree(l: Lesson) {
  return isOff(l) || !!l.skipped;
}

export type Span = { start: number; end: number };

export type Block =
  | { type: 'lesson'; lesson: Lesson; past: boolean }
  /** names: who you share it with (two shown, then "+n"); state: what you asked (see TogetherBlock); muted: you can't
   * ask for it (over, or further than two weeks ahead) */
  | { type: 'together'; span: Span; label: string; names?: string[]; muted?: boolean; state?: BreakState | null }
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
      !!prev.skipped === !!l.skipped &&
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

/** A shared break you did something with: planned (someone said yes), asked (waiting for an answer), declined. */
export type BreakState = 'planned' | 'asked' | 'declined';

export type TogetherSlot = Span & { label: string; names?: string[]; muted?: boolean; state?: BreakState | null };

/** Lessons + shared breaks of one day as blocks for a column. */
export function dayBlocks(lessons: Lesson[], together: TogetherSlot[], nowMin: number | null): Block[] {
  return [
    ...mergeLessons(lessons).map((l) => ({ type: 'lesson' as const, lesson: l, past: nowMin != null && l.end <= nowMin })),
    ...together.map((s) => ({ type: 'together' as const, span: { start: s.start, end: s.end }, label: s.label, names: s.names, muted: s.muted, state: s.state })),
  ];
}

/** Diagonal lines over a block (an overlap, a break you asked for, the skip bin): wider than any column, the parent
 * clips them. Thin and faint on purpose: a texture, never louder than the text on it. Text over them goes on a
 * rounded patch of the block's own colour (`HatchLabel`), so the lines stop where the text is. */
export function Hatch({ color, gap = 7, width = 1, opacity = 0.45 }: { color: string; gap?: number; width?: number; opacity?: number }) {
  const w = useWindowDimensions().width;
  const lines: number[] = [];
  for (let x = 0; x < w + 400; x += gap) lines.push(x);
  return (
    <Svg width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      {lines.map((x) => (
        <Line key={x} x1={x} y1={0} x2={x - 400} y2={400} stroke={color} strokeWidth={width} strokeOpacity={opacity} />
      ))}
    </Svg>
  );
}

/** Text on hatched lines: a rounded patch in the block's colour behind it, so the lines stop around the text. */
export function HatchLabel({ bg, children }: { bg: string; children: ReactNode }) {
  return <View className={cn('self-start rounded-[5px] px-1 py-px -mx-1', bg)}>{children}</View>;
}

/** A free moment shorter than this (minutes) is just walking to the next room. */
export const FREE_MIN = 15;

/** The free moments between a day's lessons (not before the first or after the last). Cancelled and skipped
 * lessons leave their time free. */
export function freeGaps(lessons: Lesson[]): Span[] {
  const ls = mergeLessons(lessons)
    .filter((l) => !isFree(l))
    .sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  let end = ls[0]?.end ?? 0;
  for (const l of ls.slice(1)) {
    if (l.start - end >= FREE_MIN) out.push({ start: end, end: l.start });
    end = Math.max(end, l.end);
  }
  return out;
}

/** A stretch of time where two or more (merged) lessons run at once, with the lessons involved. */
export type Overlap = Span & { lessons: Lesson[] };

/**
 * Where a day's lessons overlap (Untis does that: two groups, a moved lesson, a class you follow twice).
 * Cancelled and skipped lessons don't count: they don't take the time. Touching (11:00–12:00 and 12:00–13:00) isn't
 * overlapping.
 */
export function overlapsOf(lessons: Lesson[]): Overlap[] {
  const ls = mergeLessons(lessons).filter((l) => !isFree(l));
  const parts: Overlap[] = [];
  for (let i = 0; i < ls.length; i++)
    for (let j = i + 1; j < ls.length; j++) {
      const a = ls[i];
      const b = ls[j];
      if (a.day === b.day && a.start < b.end && b.start < a.end) parts.push({ start: Math.max(a.start, b.start), end: Math.min(a.end, b.end), lessons: [a, b] });
    }
  // Three lessons at once give overlapping pairs: one stretch with all of them
  parts.sort((x, y) => x.start - y.start);
  const out: Overlap[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && p.start < last.end) {
      last.end = Math.max(last.end, p.end);
      for (const l of p.lessons) if (!last.lessons.includes(l)) last.lessons.push(l);
    } else out.push({ ...p, lessons: [...p.lessons] });
  }
  return out;
}

/** How close (minutes) a tap may be to an overlap to count as a tap on it: they're often only a few minutes. */
export const OVERLAP_SLOP = 10;

/** What a tap at `min` on a day means: one lesson, a choice between overlapping ones, or nothing. Skipped lessons
 * only with `skipped` (the grid asks for those last: a shared break over one wins). */
export function lessonsAt(lessons: Lesson[], min: number, skipped = false): Lesson[] {
  const near = overlapsOf(lessons).find((o) => o.start - OVERLAP_SLOP <= min && min < o.end + OVERLAP_SLOP);
  if (near && !skipped) return [...near.lessons].sort((a, b) => a.start - b.start || a.end - b.end);
  const hit = mergeLessons(lessons).find((l) => !!l.skipped === skipped && l.start <= min && min < l.end);
  return hit ? [hit] : [];
}

/**
 * The hatched band over an overlap: diagonal lines, both course names. It sits on top of the blocks, which
 * stay where they are; tapping it asks which lesson you mean.
 */
export function OverlapBand({ overlap, style, compact, label = true, t }: { overlap: Overlap; style: object; compact?: boolean; label?: boolean; t: (k: Key, p?: Record<string, string | number>) => string }) {
  const stroke = String(useCSSVariable('--color-line-strong') ?? '#C9C4B8');
  const names = overlap.lessons.map((l) => (compact ? shortCourse(l.course ?? '') : l.course) || t('tt.lesson'));
  return (
    <View
      className="rounded-[6px] overflow-hidden bg-surface border-[1.5px] border-line-strong"
      style={style}
      pointerEvents="none"
      accessible
      accessibilityLabel={t('tt.overlap', { names: names.join(', '), from: hhmm(overlap.start), to: hhmm(overlap.end) })}
    >
      <Hatch color={stroke} opacity={0.7} />
      {label ? (
        <View className="px-1.5 py-0.5 self-start m-0.5 rounded bg-surface">
          <Text variant="xs" bold numberOfLines={compact ? 2 : 1}>
            {compact ? t('tt.overlapShort', { n: names.length }) : names.join(' · ')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function spanOf(b: Block): Span {
  return b.type === 'lesson' ? { start: b.lesson.start, end: b.lesson.end } : b.span;
}

function overlaps(a: Span, b: Span) {
  return a.start < b.end && b.start < a.end;
}

export function lessonLabel(l: Lesson, t: (k: Key, p?: Record<string, string | number>) => string) {
  const parts = [l.course ?? t('tt.busy'), `${hhmm(l.start)} ${t('tt.to')} ${hhmm(l.end)}`];
  if (l.location) parts.push(l.location);
  if (isOff(l)) parts.push(t('tt.cancelled'));
  else if (l.skipped) parts.push(t('tt.skipped'));
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
  /** false: no time axis (the Rooster tab keeps one axis still while the days slide past it) */
  axis?: boolean;
};

export function axisWidth(compact?: boolean) {
  return compact ? 24 : 44;
}

/** The hours on the left of a grid, with the 'now' time when it's on screen. */
export function TimeAxis({ pxPerHour = 48, compact, hours = [START_HOUR, END_HOUR] }: { pxPerHour?: number; compact?: boolean; hours?: [number, number] }) {
  const [h0, h1] = hours;
  const height = (h1 - h0) * pxPerHour;
  return (
    <View style={{ width: axisWidth(compact), height }}>
      {Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i)
        .filter((h) => !compact || (h - h0) % 2 === 0)
        .map((h) => (
          <Text key={h} variant="xs" bold tone="ink3" className="absolute" style={{ top: (h - h0) * pxPerHour - 9, fontSize: compact ? 11 : 12 }}>
            {compact ? String(h) : `${String(h).padStart(2, '0')}:00`}
          </Text>
        ))}
    </View>
  );
}

/** Time axis on the left, one or more day columns, a "now" line. Columns resize smoothly when their
 * number changes (layout animation), so going from 2 to 3 days glides instead of jumping. */
export function TimeGrid({ columns, pxPerHour = 48, nowMin, compact, onPressLesson, onPressTogether, hours = [START_HOUR, END_HOUR], axis = true }: GridProps) {
  const { t } = useT();
  const [h0, h1] = hours;
  const height = (h1 - h0) * pxPerHour;
  const y = (min: number) => ((min - h0 * 60) / 60) * pxPerHour;
  const axisW = axisWidth(compact);
  return (
    <View className="flex-row" style={{ height: height + 10 }}>
      {axis ? <TimeAxis pxPerHour={pxPerHour} compact={compact} hours={hours} /> : null}
      <View className="flex-1 flex-row gap-1" style={{ height }}>
        {!compact &&
          Array.from({ length: h1 - h0 + 1 }, (_, i) => (
            <View key={i} className="absolute left-0 right-0 h-px bg-line" style={{ top: i * pxPerHour }} />
          ))}
        {columns.map((col) => (
          <AView key={col.key} className="flex-1" style={{ height }} layout={layout}>
            {col.blocks.map((b, i) => {
              const s = spanOf(b);
              const top = y(Math.max(s.start, h0 * 60));
              const h = Math.max(y(Math.min(s.end, h1 * 60)) - top - 3, 18);
              // A shared break during a cancelled lesson: both get half the width
              const sharesWithOther = col.blocks.some((o, j) => j !== i && overlaps(spanOf(o), s) && ((b.type === 'together' && o.type === 'lesson' && isOff(o.lesson)) || (b.type === 'lesson' && isOff(b.lesson) && o.type === 'together')));
              const pos = sharesWithOther ? (b.type === 'together' ? { left: '55%' as const, right: 0 } : { left: 0, right: '47%' as const }) : { left: 0, right: 0 };
              return <BlockView key={i} block={b} style={{ position: 'absolute', top, height: h, ...pos }} compact={compact} onPressLesson={onPressLesson} onPressTogether={onPressTogether} t={t} />;
            })}
          </AView>
        ))}
        {nowMin != null && nowMin >= h0 * 60 && nowMin <= h1 * 60 ? (
          <View className="absolute left-0 right-0 h-0.5 bg-ink" style={{ top: y(nowMin) }} pointerEvents="none">
            {axis ? (
              <View className="absolute bg-ink rounded px-1" style={{ left: -axisW, top: -10 }}>
                <Text variant="xs" bold tone="inverse" style={{ fontSize: 12 }}>
                  {hhmm(nowMin)}
                </Text>
              </View>
            ) : (
              <View className="absolute bg-ink rounded-full w-2 h-2" style={{ left: -3, top: -3 }} />
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function BlockView({ block, style, compact, onPressLesson, onPressInLesson, onPressTogether, t }: { block: Block; style: object; compact?: boolean; onPressLesson?: (l: Lesson) => void; onPressInLesson?: () => void; onPressTogether?: (s: Span) => void; t: (k: Key, p?: Record<string, string | number>) => string }) {
  const pad = compact ? 'px-1.5 py-1' : 'px-2.5 py-1.5';
  if (block.type === 'together') {
    return <TogetherBlock block={block} style={style} compact={compact} pad={pad} onPressTogether={onPressTogether} t={t} />;
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
    // Light grey, no outline: a quiet gap with a small coffee cup in the corner
    return (
      <View className="rounded-[6px] bg-surface-sunken overflow-hidden" style={style}>
        <View className="absolute top-1 right-1">
          <Icon name="coffee" size={compact ? 15 : 18} color="ink-3" strokeWidth={1.75} />
        </View>
        {block.label ? (
          <Text variant="xs" tone="ink3" numberOfLines={1} className={pad}>
            {block.label}
          </Text>
        ) : null}
      </View>
    );
  }
  const l = block.lesson;
  if (l.skipped) return <SkippedBlock lesson={l} style={style} compact={compact} pad={pad} t={t} />;
  const off = isOff(l);
  const kind = lessonKind(l);
  const exam = kind === 'exam';
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
          : cn('border-[1.5px]', KIND_STYLE[kind]),
    l.state === 'changed' && 'border-ink',
    l.state === 'extra' && 'border-[2.5px]',
    block.past && 'opacity-55',
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lessonLabel(l, t)}
      onPressIn={onPressInLesson}
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
              {exam ? t('tt.exam') : compact ? (l.location ?? '') : [t(KIND_LABEL[kind]), l.location].filter(Boolean).join(' · ')}
            </Text>
          )}
        </>
      )}
    </Pressable>
  );
}

/**
 * A class you skip: only a dashed outline and its name struck through, so the free time (and a shared break, drawn
 * over it) shows through. A tap opens its sheet, where you can take the skip back.
 */
function SkippedBlock({ lesson, style, compact, pad, t }: { lesson: Lesson; style: object; compact?: boolean; pad: string; t: (k: Key, p?: Record<string, string | number>) => string }) {
  return (
    <View accessibilityLabel={lessonLabel(lesson, t)} className={cn(compact ? 'rounded-[6px]' : 'rounded-block', 'overflow-hidden border-[1.5px] border-dashed border-skip', pad)} style={style}>
      <Text variant="xs" bold strike tone="ink3" numberOfLines={compact ? 2 : 1}>
        {compact ? shortCourse(lesson.course ?? '') : lesson.course}
      </Text>
      <Text variant="xs" tone="ink3" numberOfLines={1}>
        {t('tt.skipped')}
      </Text>
    </View>
  );
}

/** The look of a shared break per state: open solid yellow, asked soft yellow with faint lines, planned solid yellow
 * with a check and a darker edge, declined soft red; one you can't ask for faded with a dashed edge. */
const TOGETHER_STYLE = {
  open: 'bg-together border-[1.5px] border-together',
  asked: 'bg-together-soft border-[1.5px] border-together',
  planned: 'bg-together border-[1.5px] border-together-edge',
  declined: 'bg-danger-soft border-[1.5px] border-danger',
  muted: 'bg-together-soft border-[1.5px] border-dashed border-together opacity-60',
} as const;

/**
 * A shared break: the icon in the top corner with who it's with next to it (two names at most, then "+2", so
 * it never takes more room than the block has), in the colour and pattern of its state (TOGETHER_STYLE).
 */
function TogetherBlock({ block, style, compact, pad, onPressTogether, t }: { block: Extract<Block, { type: 'together' }>; style: object; compact?: boolean; pad: string; onPressTogether?: (s: Span) => void; t: (k: Key, p?: Record<string, string | number>) => string }) {
  const hatch = String(useCSSVariable('--color-together-line') ?? '#FFC21A');
  const look = block.state ?? (block.muted ? 'muted' : 'open');
  const declined = look === 'declined';
  // On the solid yellow: always dark text; on the pale looks (asked, can't ask): the yellow's ink, readable in both themes
  const solid = look === 'open' || look === 'planned';
  const tone = declined ? 'danger' : solid ? 'onTogether' : 'together';
  const names = block.names ?? [];
  const shown = names.slice(0, 2).map((n) => (compact ? n.split(/\s+/)[0] : n));
  const extra = names.length - shown.length;
  const label = (
    <>
      <View className="flex-row items-center gap-1">
        <Icon name={look === 'planned' ? 'check' : 'together'} size={compact ? 13 : 15} color={declined ? 'danger-ink' : solid ? '#161F2A' : 'together-ink'} strokeWidth={look === 'planned' ? 2.5 : 2} />
        <Text variant="xs" bold tone={tone} numberOfLines={1} className="flex-shrink">
          {shown[0] ?? (compact ? '' : t('tt.together'))}
        </Text>
      </View>
      {shown[1] ? (
        <Text variant="xs" bold tone={tone} numberOfLines={1}>
          {extra > 0 ? `${shown[1]} +${extra}` : shown[1]}
        </Text>
      ) : null}
    </>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[`${t('tt.together')} ${block.label}, ${hhmm(block.span.start)} ${t('tt.to')} ${hhmm(block.span.end)}`, block.state ? t(STATE_LABEL[block.state]) : null].filter(Boolean).join(', ')}
      onPress={onPressTogether && !block.muted ? () => onPressTogether(block.span) : undefined}
      className={cn('rounded-block overflow-hidden', pad, TOGETHER_STYLE[look])}
      style={style}
    >
      {look === 'asked' ? <Hatch color={hatch} gap={8} opacity={0.3} /> : null}
      {look === 'asked' ? <HatchLabel bg="bg-together-soft">{label}</HatchLabel> : label}
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

export const STATE_LABEL: Record<BreakState, Key> = { planned: 'tt.planned', asked: 'tt.asked', declined: 'tt.declined' };

export type LegendItem = LessonKind | 'cancelled' | 'skipped' | 'together' | 'friend' | BreakState;

export function Legend({ items }: { items: LegendItem[] }) {
  const { t } = useT();
  const hatch = String(useCSSVariable('--color-together-line') ?? '#FFC21A');
  const sw = (i: LegendItem) =>
    i === 'cancelled'
      ? 'border-[1.5px] border-dashed border-danger'
      : i === 'skipped'
        ? 'border-[1.5px] border-dashed border-skip'
        : i === 'together'
        ? TOGETHER_STYLE.open
        : i === 'planned' || i === 'asked' || i === 'declined'
          ? TOGETHER_STYLE[i]
          : i === 'friend'
            ? 'bg-friend-soft border-[1.5px] border-friend'
            : cn('border-[1.5px]', KIND_STYLE[i]);
  const label = (i: LegendItem): Key =>
    i === 'cancelled' ? 'tt.cancelled' : i === 'skipped' ? 'tt.skipped' : i === 'together' ? 'tt.together' : i === 'planned' || i === 'asked' || i === 'declined' ? STATE_LABEL[i] : i === 'friend' ? 'tt.friendLesson' : KIND_LABEL[i];
  return (
    // One line that scrolls sideways: it never grows taller (that would push the timetable up)
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-x-3.5" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {items.map((i) => (
        <View key={i} className="flex-row items-center gap-1.5">
          <View className={cn('w-4 h-3 rounded-[3px] overflow-hidden', sw(i))}>{i === 'asked' ? <Hatch color={hatch} gap={4} opacity={0.6} /> : null}</View>
          <Text variant="xs" bold tone="ink2">
            {t(label(i))}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
