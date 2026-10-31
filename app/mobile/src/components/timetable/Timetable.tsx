import { memo, type ReactNode, useId, useState } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import { useDetails } from '@/api/hooks';
import type { Lesson } from '@/api/types';
import { Icon } from '@/components/ui/Icon';
import { AView, layout } from '@/components/ui/Motion';
import { Text } from '@/components/ui/Text';
import { useT, type Key } from '@/i18n';
import { cn } from '@/lib/cn';
import { detailRows, layoutFor, shortTitle } from '@/lib/details';
import { hhmm, range } from '@/lib/time';

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
 * rounded patch of the block's own colour (`HatchLabel`), so the lines stop where the text is.
 * One SVG pattern filled into one rectangle, not a line per stripe: the lines are `gap` apart horizontally (as they
 * were drawn one by one), at 45°. Every instance has its own pattern id (SVG ids are shared on the web). */
export const Hatch = memo(function Hatch({ color, gap = 7, width = 1, opacity = 0.45 }: { color: string; gap?: number; width?: number; opacity?: number }) {
  const id = `hatch${useId().replace(/\W/g, '')}`;
  // The tile is turned 45°, so the lines are `gap` apart horizontally when the tile is gap/√2 across
  const tile = gap / Math.SQRT2;
  return (
    <Svg width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={tile} height={tile} patternTransform="rotate(45)">
          {/* Down and to the left, like the lines it replaces; in the middle of the tile so none of it is cut off */}
          <Line x1={tile / 2} y1={0} x2={tile / 2} y2={tile} stroke={color} strokeWidth={width} strokeOpacity={opacity} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
});

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
  return lessonsIn(mergeLessons(lessons), overlapsOf(lessons), min, skipped);
}

/** `lessonsAt` for a day that has been worked out already: its merged lessons and its overlaps (`DayCache`). */
export function lessonsIn(merged: Lesson[], overlaps: Overlap[], min: number, skipped = false): Lesson[] {
  const near = overlaps.find((o) => o.start - OVERLAP_SLOP <= min && min < o.end + OVERLAP_SLOP);
  if (near && !skipped) return [...near.lessons].sort((a, b) => a.start - b.start || a.end - b.end);
  const hit = merged.find((l) => !!l.skipped === skipped && l.start <= min && min < l.end);
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

/** The hours on the left of a grid. The first and the last are always there and a little brighter: they are what you
 * drag on the Rooster tab to change the hours you see (a narrow axis shows every other hour in between). */
export const TimeAxis = memo(function TimeAxis({ pxPerHour = 48, compact, hours = [START_HOUR, END_HOUR] }: { pxPerHour?: number; compact?: boolean; hours?: [number, number] }) {
  const [h0, h1] = hours;
  const height = (h1 - h0) * pxPerHour;
  return (
    <View style={{ width: axisWidth(compact), height }}>
      {Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i)
        .filter((h) => !compact || h === h0 || h === h1 || ((h - h0) % 2 === 0 && h1 - h >= 2))
        .map((h) => (
          <Text key={h} variant="xs" bold tone={h === h0 || h === h1 ? 'ink2' : 'ink3'} className="absolute" style={{ top: (h - h0) * pxPerHour - 9, fontSize: compact ? 11 : 12 }}>
            {compact ? String(h) : `${String(h).padStart(2, '0')}:00`}
          </Text>
        ))}
    </View>
  );
});

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
      <LessonBody lesson={l} compact={compact} t={t} />
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

export const Legend = memo(function Legend({ items }: { items: LegendItem[] }) {
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
});

/** The space a lesson card's text has: how many lines of small text fit, and its width in px rounded to `STEP`, so a
 * card re-renders only when its layout could change (not on every frame of a pinch). */
type Fit = { lines: number; w: number };
const LINE = 16;
const STEP = 6;
/** About how wide one character of small text is (px): to see whether a prefix still fits next to its value */
const CH = 6.6;
/** Narrower or lower than this (px), nothing on a card is legible: it shows no text at all */
const MIN_W = 28;
const MIN_H = 11;
function fitOf(w: number, h: number): Fit {
  return { lines: h < MIN_H ? 0 : Math.max(1, Math.floor((h + 2) / LINE)), w: Math.floor(w / STEP) * STEP };
}

type Item = { pre: string | null; value: string; tone?: 'danger' };
/** An item as text in `room` px: with its prefix when both fit, else the value only (the value always wins) */
const say = (it: Item, room: number) => (it.pre && (it.pre.length + 1 + it.value.length) * CH <= room ? `${it.pre} ${it.value}` : it.value);

/**
 * What a lesson card says, after the room it has (it measures itself): first the course, then its details as the
 * source layout breaks them up (Type, Building, Floor, Classroom, ... in your order: lib/details), then the time.
 * A detail gets its short field name in front ('Verd. -01', 'Lok. 019': `details.shortTitle`) only when prefix and
 * value both fit; otherwise just the value, so the numbers are always readable. Too narrow or too low to read
 * anything: no text at all (the colour still shows a class is there; tap it for the sheet).
 * Tall and narrow (a whole week, a lane in Vergelijken): the name may take two or three lines and each detail gets a
 * line of its own, as many as fit; on a very narrow card the type goes last and the name is shortened. Wide: the name
 * on one line and the details side by side under it (wrapping when there's height for it). One line only: the name,
 * and on a wide card the first detail after it. Cancelled or exam says so first. `friend`: a friend's class
 * (Vergelijken), which has its own colours.
 */
export function LessonBody({ lesson: l, compact, t, friend = false }: { lesson: Lesson; compact?: boolean; t: (k: Key, p?: Record<string, string | number>) => string; friend?: boolean }) {
  const details = useDetails();
  const [fit, setFit] = useState<Fit | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const f = fitOf(e.nativeEvent.layout.width, e.nativeEvent.layout.height);
    setFit((x) => (x && x.lines === f.lines && x.w === f.w ? x : f));
  };
  const off = isOff(l);
  const kind = lessonKind(l);
  const exam = kind === 'exam' && !friend;
  const kindName = t(KIND_LABEL[kind]);
  const w = fit?.w ?? (compact ? 90 : 200);
  const lines = fit?.lines ?? 2;
  const width = w < 64 ? 0 : w < 110 ? 1 : w < 170 ? 2 : 3;
  const course = l.course ?? t('tt.lesson');
  const name = width === 0 && l.course ? shortCourse(course) : course;
  // The details in the layout's order, each with its prefix; on narrow cards the type last (the colour already says it)
  const layout = layoutFor(l.origin, details.data);
  let values: Item[] = l.course ? detailRows(l, kind === 'other' ? null : kindName, layout, t).map((r) => ({ pre: shortTitle(r, layout, t), value: r.value })) : [];
  if (width <= 1) values = [...values.filter((v) => v.value !== kindName), ...values.filter((v) => v.value === kindName)];
  const items: Item[] = [...(off ? [{ pre: null, value: t('tt.cancelled'), tone: 'danger' as const }] : exam ? [{ pre: null, value: t('tt.exam') }] : []), ...values, { pre: null, value: range(l.start, l.end) }];
  const tone = exam ? 'inverse' : off ? 'ink2' : 'ink';
  const itemTone = (it: Item) => (it.tone ?? (exam ? 'inverse' : 'ink'));
  const big = width >= 2 && !compact;
  const changed = width === 3 && l.state === 'changed';
  let body: ReactNode = null;
  if (fit && (fit.w < MIN_W || fit.lines === 0)) {
    // Nothing would be legible: no text
  } else if (lines <= 1 || (big && lines <= 2 && width < 3)) {
    // One line (two with the bigger name): the name, on a wide card with what matters most after it
    body = (
      <Text variant={big ? 'sm' : 'xs'} bold strike={off} tone={tone} numberOfLines={1}>
        {width >= 2 && items.length > 1 ? `${name} · ${say(items[0], w - (name.length + 3) * CH)}` : name}
      </Text>
    );
  } else if (width === 3) {
    // Wide: name on top, the details side by side under it; with prefixes when the whole line still fits that way
    const rows = Math.max(1, lines - (big ? 2 : 1));
    const all = items.map((it) => (it.pre ? `${it.pre} ${it.value}` : it.value)).join(' · ');
    const text = all.length * CH <= w * rows ? all : items.map((it) => it.value).join(' · ');
    body = (
      <>
        <View className="flex-row items-center justify-between gap-1">
          <Text variant={big ? 'sm' : 'xs'} bold strike={off} tone={tone} numberOfLines={1} className="flex-1">
            {name}
          </Text>
          {changed ? (
            <View className="bg-ink rounded-md px-1.5">
              <Text variant="xs" bold tone="inverse">
                {t('tt.changed')}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="xs" tone={off ? 'danger' : exam ? 'inverse' : 'ink'} numberOfLines={rows}>
          {text}
        </Text>
      </>
    );
  } else {
    // Narrow: the name may wrap, then a detail per line, as many as fit
    const nameLines = lines <= 2 ? 1 : Math.min(width === 0 ? 3 : 2, Math.max(1, lines - items.length));
    const shown = items.slice(0, Math.max(0, lines - nameLines - (big ? 1 : 0)));
    body = (
      <>
        <Text variant={big ? 'sm' : 'xs'} bold strike={off} tone={tone} numberOfLines={nameLines}>
          {name}
        </Text>
        {shown.map((it, i) => (
          <Text key={`${i}:${it.value}`} variant="xs" tone={itemTone(it)} bold={!!it.tone} numberOfLines={1}>
            {say(it, w)}
          </Text>
        ))}
      </>
    );
  }
  return (
    <View className="flex-1 overflow-hidden" onLayout={onLayout}>
      {body}
    </View>
  );
}
