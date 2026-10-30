import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { FadeInDown, FadeOutDown, useSharedValue } from 'react-native-reanimated';

import { useAskSkip, useFriends, useFriendSchedules, useSkipAsks, useWeeks } from '@/api/hooks';
import type { Friend, FriendSchedule, Lesson, SkipRequest, Together } from '@/api/types';
import { breakTarget, PeopleSheet, type PeopleTarget } from '@/components/PeopleSheet';
import { Avatar } from '@/components/ui/Bits';
import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { AView } from '@/components/ui/Motion';
import { Text } from '@/components/ui/Text';
import { type Key, type Lang, useT } from '@/i18n';
import { duration } from '@/lib/breaks';
import { cn } from '@/lib/cn';
import { useStable } from '@/lib/latest';
import { dateAt, dayIndex, mondayOf, weekdayOf } from '@/lib/days';
import { isoDay, nowMin, weekdayShort } from '@/lib/time';

import { HOURS } from './DayCache';
import { DragLayer, type DragTarget, useDragTargets, useSkipDrag, useSkipGesture } from './SkipDrag';
import { BlockView, freeGaps, Hatch, HatchLabel, isOff, Legend, type LegendItem, lessonKind, mergeLessons, shortCourse, type Span, TimeAxis } from './Timetable';

type T = (k: Key, p?: Record<string, string | number>) => string;

const AXIS_W = 30;
/** Height of the row with the people above the columns */
const HEAD_H = 52;
/** A column narrower than this shows short names and no rooms */
const NARROW = 90;

/** How many days you see side by side: one, two when you compare with at most two friends (three people), more with
 * Premium (later). */
export function maxDays(people: number, premium = false) {
  return premium ? 5 : people <= 3 ? 2 : 1;
}

/** The first day to show: today on a weekday, otherwise next Monday (Vergelijken shows Monday to Friday only). */
export function firstDay(today: number) {
  return weekdayOf(today) <= 4 ? today : mondayOf(today) + 7;
}

type Column = { day: number; person: Friend | null };

/** Two spans overlap */
const meets = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/**
 * Vergelijken: you and the friends you picked side by side, one column each, for one day (or two, see `maxDays`),
 * Monday to Friday (the strip on top, arrows for the week before and after). Your column: your lessons and your
 * breaks ('Vrij', dashed; what's cancelled in it under the word). A friend's column: their classes in pink with
 * the name and room only when they show you those (the API leaves them out otherwise), and in yellow the breaks you
 * share with them ('Samen'). Tap a break for the mini timetable of your break (PeopleSheet: who's there when).
 * Drag one of a friend's classes into the bin to ask them whether they'd skip it (`useAskSkip`, "Volg je Python?"):
 * for you it shows as skipped at once with the break you'd share hatched; for them nothing changes until they say
 * yes in the chat. The people above the columns are cards; + adds or changes who (`onAdd`).
 */
export function CompareView({ ids, onAdd, premium = false }: { ids: number[]; onAdd: () => void; premium?: boolean }) {
  const { t, lang } = useT();
  const today = dayIndex(new Date());
  const friends = useFriends();
  const [start, setStart] = useState(() => firstDay(today));
  const most = maxDays(ids.length + 1, premium);
  const [want, setWant] = useState(1);
  const n = Math.min(want, most, 5 - weekdayOf(start));
  const monday = mondayOf(start);
  const mondayIso = isoDay(dateAt(monday));
  const [week] = useWeeks([mondayIso]);
  const theirs = useFriendSchedules(ids, mondayIso, 5);
  const asks = useSkipAsks();
  const ask = useAskSkip();
  const [people, setPeople] = useState<PeopleTarget>(null);
  const [note, setNote] = useState<{ id: number; text: string; bad?: boolean } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const byId = useMemo(() => new Map((friends.data ?? []).map((f) => [f.id, f])), [friends.data]);
  const picked = ids.map((id) => byId.get(id)).filter((f): f is Friend => !!f);
  const sched = new Map<number, FriendSchedule | undefined>(ids.map((id, i) => [id, theirs[i]?.data]));
  const days = Array.from({ length: n }, (_, i) => start + i);
  const columns: Column[] = days.flatMap((day) => [{ day, person: null }, ...picked.map((p) => ({ day, person: p }))]);

  const mine = (day: number) => (week?.data?.lessons ?? []).filter((l) => l.day === isoDay(dateAt(day)));
  const friendLessons = (id: number, day: number) => (sched.get(id)?.lessons ?? []).filter((l) => l.day === isoDay(dateAt(day)));
  const together = (day: number): Together[] => week?.data?.together?.[isoDay(dateAt(day))] ?? [];
  // Your open questions about a friend's class: only you see them as skipped
  const asked = (id: number, day: number) => (asks.data ?? []).filter((s) => s.mine && s.status === 'pending' && s.to.id === id && s.day === isoDay(dateAt(day)));

  // Hours: the standard ones, stretched by any lesson in view
  const inView = columns.flatMap((c) => (c.person ? friendLessons(c.person.id, c.day) : mine(c.day)));
  const h0 = Math.min(HOURS[0], ...inView.map((l) => Math.floor(l.start / 60)));
  const h1 = Math.max(HOURS[1], ...inView.map((l) => Math.ceil(l.end / 60)));
  const hours = useMemo<[number, number]>(() => [h0, h1], [h0, h1]);
  const pxPerHour = size.h ? size.h / (h1 - h0) : 40;
  const y = (min: number) => ((min - h0 * 60) / 60) * pxPerHour;
  const colW = columns.length ? size.w / columns.length : 0;
  const compact = colW < NARROW;
  const now = nowMin();

  /** Your break around `span` that day, as the mini timetable */
  function openBreak(day: number, span: Span) {
    const gap = freeGaps(mine(day)).find((g) => meets(g, span)) ?? span;
    const target = breakTarget({ day: isoDay(dateAt(day)), gap, together: together(day), friends: friends.data, now: day === today ? now : 0 });
    if (target) setPeople(target);
  }

  // Dragging a friend's class into the bin: the columns are the 'days' of the drag (offset 0, one per column)
  const drag = useSkipDrag();
  const offset = useSharedValue(0);
  const count = useSharedValue(Math.max(1, columns.length));
  useEffect(() => {
    count.set(Math.max(1, columns.length));
  }, [columns.length, count]);
  const targets: (DragTarget & { lesson: Lesson; friend: Friend })[] = [];
  columns.forEach((c, i) => {
    if (!c.person || c.day < today) return;
    const open = asked(c.person.id, c.day);
    for (const l of mergeLessons(friendLessons(c.person.id, c.day)))
      if (l.busy && !isOff(l) && (c.day > today || l.end > now) && !open.some((s) => meets(s, l))) targets.push({ day: i, start: l.start, end: l.end, lesson: l, friend: c.person });
  });
  const shared = useDragTargets(targets.map(({ day, start, end }) => ({ day, start, end })));
  const [lifted, setLifted] = useState<Lesson | null>(null);
  const find = (col: number, s: number) => targets.find((g) => g.day === col && g.start === s);
  const onPick = useStable((col: number, s: number) => setLifted(find(col, s)?.lesson ?? null));
  const onDrop = useStable((col: number, s: number) => {
      const g = find(col, s);
      if (!g) return;
      const id = Date.now();
      const name = g.friend.display_name.split(/\s+/)[0];
      setNote({ id, text: t('compare.asking', { name }) });
      ask.mutate(
        { friend: g.friend.id, day: isoDay(dateAt(columns[col].day)), start: g.lesson.start, end: g.lesson.end },
        {
          onSuccess: (r) => setNote({ id, text: t('compare.asked', { name, dur: duration(r.skip.minutes, t) }) }),
          onError: (e) => setNote({ id, text: e.message, bad: true }),
        },
      );
  });
  const gesture = useSkipGesture({ drag, targets: shared, offset, count, width: size.w, height: size.h, min0: h0 * 60, min1: h1 * 60, pxPerHour, labelH: 0, onPick, onDrop, enabled: size.w > 0 });
  useEffect(() => {
    if (!note) return;
    const away = setTimeout(() => setNote((x) => (x?.id === note.id ? null : x)), 4500);
    return () => clearTimeout(away);
  }, [note]);

  const legend = useMemo<LegendItem[]>(() => {
    const out = new Set<LegendItem>();
    for (const d of days) for (const l of mine(d)) if (!isOff(l)) out.add(lessonKind(l));
    return [...out, 'friend', 'together'];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- what's in view
  }, [week?.data, start, n]);

  return (
    <View className="flex-1 gap-2">
      <DayPicker start={start} n={n} most={most} today={today} lang={lang} t={t} onPick={setStart} onDays={(k) => {
          setWant(k);
          setStart((s) => Math.min(s, mondayOf(s) + 5 - Math.min(k, most)));
        }} />
      {/* Who: 'Jij', then a card per friend, + after the last one; with two days the date above each group */}
      <View className="flex-row" style={{ minHeight: HEAD_H }}>
        <View style={{ width: AXIS_W }} />
        {columns.map((c, i) => (
          <View key={`${c.day}:${c.person?.id ?? 'me'}`} className="flex-1 justify-center px-0.5">
            {n > 1 && !c.person ? (
              <Text variant="xs" bold tone="ink3" numberOfLines={1} className="absolute top-0 left-1">
                {`${weekdayShort(dateAt(c.day), lang)} ${dateAt(c.day).getDate()}`}
              </Text>
            ) : null}
            <View className="flex-row items-center justify-center gap-1">
              {c.person ? <PersonCard friend={c.person} compact={compact} /> : <Text bold tone="ink2">{t('compare.you')}</Text>}
              {i === columns.length - 1 ? <IconButton icon="plus" label={t('compare.add')} onPress={onAdd} className="w-9 h-9 rounded-full border-[1.5px] border-line-strong" /> : null}
            </View>
          </View>
        ))}
      </View>
      <View className="flex-1 flex-row">
        <View style={{ width: AXIS_W }}>
          <TimeAxis pxPerHour={pxPerHour} hours={hours} compact />
        </View>
        <GestureDetector gesture={gesture}>
          <View collapsable={false} className="flex-1 flex-row" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            {Array.from({ length: h1 - h0 + 1 }, (_, i) => (
              <View key={i} pointerEvents="none" className="absolute left-0 right-0 h-px bg-line" style={{ top: i * pxPerHour }} />
            ))}
            {columns.map((c, i) => (
              <View key={`${c.day}:${c.person?.id ?? 'me'}`} className={cn('flex-1', i > 0 && c.person === null && 'border-l border-line-strong')}>
                {c.person ? (
                  <FriendColumn friend={c.person} sched={sched.get(c.person.id)} lessons={friendLessons(c.person.id, c.day)} mineLessons={mine(c.day)} together={together(c.day).filter((s) => s.id === c.person!.id)} asked={asked(c.person.id, c.day)} y={y} compact={compact} past={c.day < today ? 24 * 60 : c.day === today ? now : -1} t={t} onBreak={(s) => openBreak(c.day, s)} />
                ) : (
                  <MyColumn lessons={mine(c.day)} y={y} compact={compact} past={c.day < today ? 24 * 60 : c.day === today ? now : -1} t={t} onBreak={(s) => openBreak(c.day, s)} />
                )}
              </View>
            ))}
            {days.includes(today) && now >= h0 * 60 && now <= h1 * 60 ? <View pointerEvents="none" className="absolute left-0 right-0 h-0.5 bg-ink" style={{ top: y(now) }} /> : null}
            {size.w ? <DragLayer drag={drag} lesson={lifted} width={size.w} height={size.h} compact={compact} /> : null}
          </View>
        </GestureDetector>
        {note ? (
          <AView key={note.id} entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(160)} className="absolute left-8 right-2 bottom-2 bg-ink rounded-card px-4 py-3">
            <Pressable onPress={() => setNote(null)} accessibilityLiveRegion="polite">
              <Text variant="sm" bold tone={note.bad ? 'danger' : 'inverse'}>
                {note.text}
              </Text>
            </Pressable>
          </AView>
        ) : null}
      </View>
      <Legend items={legend} />
      <PeopleSheet target={people} onClose={() => setPeople(null)} />
    </View>
  );
}

/** A friend above their column: a card with their face and first name (only the face when the column is narrow). */
function PersonCard({ friend, compact }: { friend: Friend; compact: boolean }) {
  return (
    <View className={cn('flex-row items-center gap-1.5 rounded-card border-[1.5px] border-line-strong bg-surface', compact ? 'p-1' : 'pl-1 pr-2.5 py-1')} accessibilityLabel={friend.display_name}>
      <Avatar name={friend.display_name} color={friend.avatar_color} uid={friend.id} photo={friend.photo} size="xs" />
      {!compact ? (
        <Text variant="sm" bold numberOfLines={1} className="flex-shrink">
          {friend.display_name.split(/\s+/)[0]}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Monday to Friday of one week: tap a day to see it (with two days: it and the next, ending on Friday at the latest),
 * the arrows go a week back or ahead, and '1 dag / 2 dagen' switches when you may see more than one (`maxDays`).
 */
function DayPicker({ start, n, most, today, lang, t, onPick, onDays }: { start: number; n: number; most: number; today: number; lang: Lang; t: T; onPick: (d: number) => void; onDays: (n: number) => void }) {
  const monday = mondayOf(start);
  const pick = (d: number) => onPick(Math.min(d, monday + 5 - n));
  return (
    <View className="flex-row items-center gap-1">
      <IconButton icon="back" label={t('compare.weekBefore')} onPress={() => onPick(monday - 7 + weekdayOf(start))} className="w-8 h-10" />
      <View className="flex-1 flex-row gap-1">
        {Array.from({ length: 5 }, (_, i) => monday + i).map((d) => {
          const on = d >= start && d < start + n;
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={dateAt(d).toLocaleDateString(lang === 'nl' ? 'nl-BE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              onPress={() => pick(d)}
              className={cn('flex-1 items-center rounded-[10px] py-1.5 border-[1.5px]', on ? 'bg-ink border-ink' : d === today ? 'border-you' : 'border-transparent')}
            >
              <Text variant="xs" bold tone={on ? 'inverse' : 'ink2'}>
                {weekdayShort(dateAt(d), lang).toUpperCase()}
              </Text>
              <Text bold tone={on ? 'inverse' : 'ink'}>
                {String(dateAt(d).getDate())}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <IconButton icon="forward" label={t('compare.weekAfter')} onPress={() => onPick(monday + 7 + weekdayOf(start))} className="w-8 h-10" />
      {most > 1 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('compare.daysToggle', { n: n >= most ? 1 : n + 1 })}
          onPress={() => onDays(n >= most ? 1 : n + 1)}
          className="items-center justify-center rounded-[10px] border-[1.5px] border-line-strong px-2 h-11"
        >
          <Text variant="xs" bold>
            {t('compare.nDays', { n })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type ColProps = { y: (min: number) => number; compact: boolean; past: number; t: T; onBreak: (s: Span) => void };

function place(y: (m: number) => number, s: Span) {
  const top = y(s.start);
  return { position: 'absolute' as const, left: 1, right: 1, top, height: Math.max(y(s.end) - top - 3, 18) };
}

/** Your column: your lessons as on the Rooster tab, and your breaks as a dashed 'Vrij' (what's cancelled in it under
 * the word); a tap on a break shows how it goes (who's there when). */
function MyColumn({ lessons, y, compact, past, t, onBreak }: ColProps & { lessons: Lesson[] }) {
  const merged = mergeLessons(lessons);
  return (
    <View className="flex-1">
      {merged.map((l) => (
        <BlockView key={`${l.start}:${l.course}`} block={{ type: 'lesson', lesson: l, past: l.end <= past }} style={place(y, l)} compact={compact} t={t} />
      ))}
      {freeGaps(lessons).map((g) => {
        const off = merged.find((l) => isOff(l) && meets(l, g));
        return (
          <Pressable key={g.start} accessibilityRole="button" accessibilityLabel={t('compare.free')} onPress={() => onBreak(g)} className={cn('rounded-block border-[1.5px] border-dashed border-line-strong px-1.5 py-1', g.end <= past && 'opacity-55')} style={place(y, g)}>
            <Text variant="xs" bold tone="ink3">
              {t('compare.free')}
            </Text>
            {off && !compact ? (
              <Text variant="xs" tone="ink3" numberOfLines={1}>
                {t('compare.offIn', { course: shortCourse(off.course ?? '') })}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A friend's column: their classes in pink ('Les', or the name and room when they show you those), the breaks you
 * share in yellow ('Samen'). A class you asked about is dashed and struck through ('Gevraagd'), with the break you'd
 * share then hatched over it: only on your phone, until they answer.
 */
function FriendColumn({ friend, sched, lessons, mineLessons, together, asked, y, compact, past, t, onBreak }: ColProps & { friend: Friend; sched: FriendSchedule | undefined; lessons: Lesson[]; mineLessons: Lesson[]; together: Together[]; asked: SkipRequest[] }) {
  if (sched?.hidden || friend.hidden) {
    return (
      <View className="flex-1 items-center pt-6 px-1">
        <Text variant="xs" tone="ink3" className="text-center">
          {t('status.hidden')}
        </Text>
      </View>
    );
  }
  const merged = mergeLessons(lessons);
  // What you'd share if they said yes: the class asked about, where you're free too (and no shared break yet)
  const myFree = freeGaps(mineLessons);
  const maybe = asked.flatMap((s) => myFree.filter((g) => meets(g, s)).map((g) => ({ start: Math.max(g.start, s.start), end: Math.min(g.end, s.end) }))).filter((s) => !together.some((x) => x.start <= s.start && s.end <= x.end));
  return (
    <View className="flex-1">
      {merged.map((l) => {
        const isAsked = asked.some((s) => meets(s, l));
        return <FriendLesson key={`${l.start}:${l.end}`} lesson={l} asked={isAsked} style={place(y, l)} compact={compact} faded={l.end <= past} t={t} />;
      })}
      {together.map((s) => (
        <Pressable key={`t${s.start}`} accessibilityRole="button" accessibilityLabel={`${t('compare.together')} ${friend.display_name}`} onPress={() => onBreak(s)} className={cn('rounded-block bg-together border-[1.5px] border-together items-center justify-center', s.end <= past && 'opacity-55')} style={place(y, s)}>
          <Icon name="coffee" size={compact ? 15 : 18} color="#161F2A" strokeWidth={2} />
          <Text variant="xs" bold tone="onTogether" numberOfLines={1}>
            {t('compare.together')}
          </Text>
        </Pressable>
      ))}
      {maybe.map((s) => (
        <MaybeTogether key={`m${s.start}`} style={place(y, s)} t={t} onPress={() => onBreak(s)} />
      ))}
    </View>
  );
}

/** A break you'd share once they say yes: pale yellow with lines, like a break you asked for. */
function MaybeTogether({ style, t, onPress }: { style: object; t: T; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('compare.maybe')} onPress={onPress} className="rounded-block overflow-hidden bg-together-soft border-[1.5px] border-together items-center justify-center" style={style}>
      <Hatch color="#FFC21A" gap={8} opacity={0.3} />
      <HatchLabel bg="bg-together-soft">
        <Text variant="xs" bold tone="together">
          {t('compare.maybe')}
        </Text>
      </HatchLabel>
    </Pressable>
  );
}

/** One of a friend's classes: pink, with its name and room when they show you those (else just 'Les'). */
function FriendLesson({ lesson, asked, style, compact, faded, t }: { lesson: Lesson; asked: boolean; style: object; compact: boolean; faded: boolean; t: T }) {
  const off = isOff(lesson);
  const name = lesson.course ? (compact ? shortCourse(lesson.course) : lesson.course) : t('tt.lesson');
  return (
    <View
      accessibilityLabel={[name, lesson.location, asked ? t('compare.askedTag') : off ? t('tt.cancelled') : null].filter(Boolean).join(', ')}
      className={cn('rounded-block overflow-hidden px-1.5 py-1', asked ? 'border-[1.5px] border-dashed border-skip' : off ? 'bg-surface border-[1.5px] border-dashed border-danger' : 'bg-friend-soft border-[1.5px] border-friend', faded && 'opacity-55')}
      style={style}
    >
      <Text variant="xs" bold strike={asked || off} tone={asked || off ? 'ink3' : 'ink'} numberOfLines={compact ? 2 : 1}>
        {name}
      </Text>
      {asked ? (
        <Text variant="xs" tone="ink3" numberOfLines={1}>
          {t('compare.askedTag')}
        </Text>
      ) : lesson.location && !compact ? (
        <Text variant="xs" numberOfLines={1}>
          {lesson.location}
        </Text>
      ) : null}
    </View>
  );
}
