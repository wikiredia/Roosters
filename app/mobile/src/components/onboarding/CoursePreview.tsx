import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useClassLessons } from '@/api/hooks';
import type { ClassLesson, Lesson, Semester, Source, Terms } from '@/api/types';
import { WeekView } from '@/components/timetable/WeekView';
import { Chip, Tag } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, Row } from '@/components/ui/Layout';
import { AView, enter, exit, layout } from '@/components/ui/Motion';
import { Skeleton } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { type Lang, useT } from '@/i18n';
import { type Choices, dropAnalysis, type DropOption, inSemester, isOn, missing, preview, setOn } from '@/lib/choices';
import { addDays, hhmm, isoDay, monday as mondayOf, monthRange, range, shortDate, weekdayShort } from '@/lib/time';

type T = ReturnType<typeof useT>['t'];

/** The week the previews open on: this one, or the coming one at the weekend. */
export function startWeek(now = new Date()) {
  const d = now.getDay() === 0 || now.getDay() === 6 ? addDays(now, 3) : now;
  return mondayOf(d);
}

/** Which semester a week is in (by its Wednesday), from the school year's dates. */
export function semesterOf(week: Date, terms?: Terms): Semester | null {
  if (!terms) return null;
  const mid = isoDay(addDays(week, 2));
  if (mid >= terms.s1.start && mid <= terms.s1.end) return 1;
  if (mid >= terms.s2.start && mid <= terms.s2.end) return 2;
  return null;
}

function toLesson(l: ClassLesson): Lesson {
  return { day: l.day, start: l.start, end: l.end, busy: true, course: l.course, location: l.location, state: l.state, kind: l.kind };
}

function semLabel(t: T, s?: Semester | null) {
  return s ? t('classes.semester', { n: s }) : t('preview.allYear');
}

/** ‹  19 – 23 oktober · Semester 1  › */
function WeekNav({ week, onChange, lang, sem }: { week: Date; onChange: (d: Date) => void; lang: Lang; sem: Semester | null }) {
  const { t } = useT();
  return (
    <View className="flex-row items-center justify-between">
      <IconButton icon="back" label={t('preview.prevWeek')} onPress={() => onChange(addDays(week, -7))} />
      <View className="items-center">
        <Text bold>{monthRange(week, addDays(week, 4), lang)}</Text>
        <Text variant="xs" tone="ink2">
          {semLabel(t, sem)}
        </Text>
      </View>
      <IconButton icon="forward" label={t('preview.nextWeek')} onPress={() => onChange(addDays(week, 7))} />
    </View>
  );
}

function useWeekLessons(schoolId: number | null, sources: Source[], week: Date) {
  const results = useClassLessons(schoolId, sources.map((s) => s.class_id ?? 0), isoDay(week), 5);
  const stamp = results.map((r) => r.dataUpdatedAt).join();
  const ids = sources.map((s) => s.id).join();
  const bySource = useMemo(() => {
    const out: Record<number, ClassLesson[]> = {};
    sources.forEach((s, i) => (out[s.id] = results[i]?.data?.lessons ?? []));
    return out;
  }, [stamp, ids]);
  const loading = results.some((r) => !r.data || r.data.loading);
  return { bySource, loading };
}

/**
 * 'Bekijk rooster van <klas>': that class's whole week, every course. Tap a lesson to switch its course
 * on or off; courses you don't take are faded.
 */
export function ClassWeekSheet({ source, onClose, schoolId, choices, setChoices, terms }: { source: Source | null; onClose: () => void; schoolId: number | null; choices: Choices; setChoices: (f: (c: Choices) => Choices) => void; terms?: Terms }) {
  const { t, lang } = useT();
  const [week, setWeek] = useState(startWeek);
  const [last, setLast] = useState(source);
  if (source && source !== last) setLast(source);
  const s = source ?? last;
  const { bySource, loading } = useWeekLessons(schoolId, s ? [s] : [], week);
  const lessons = s ? (bySource[s.id] ?? []).map(toLesson) : [];
  const sem = semesterOf(week, terms);
  const outside = !!s?.semester && !!sem && s.semester !== sem;
  return (
    <Sheet visible={!!source} onClose={onClose} closeLabel={t('common.close')} title={s?.label} sub={t('preview.classSub')}>
      <WeekNav week={week} onChange={setWeek} lang={lang} sem={sem} />
      {outside ? (
        <Text variant="sm" tone="ink2">
          {t('preview.otherSemester', { n: s?.semester ?? 1 })}
        </Text>
      ) : null}
      {loading && lessons.length === 0 ? (
        <Skeleton className="h-64 rounded-card" />
      ) : (
        <WeekView
          monday={week}
          lessons={lessons}
          todayIso={isoDay(new Date())}
          nowMin={null}
          pxPerHour={30}
          dim={(l) => !s || !isOn(choices[s.id], l.course ?? '')}
          onPressLesson={(l) => s && l.course && setChoices((c) => ({ ...c, [s.id]: setOn(c[s.id] ?? { include: [] }, l.course!, !isOn(c[s.id], l.course!)) }))}
        />
      )}
    </Sheet>
  );
}

type View_ = { kind: 'week' } | { kind: 'lesson'; lesson: ClassLesson & { source: number } } | { kind: 'missing' };

/**
 * 'Bekijk gevonden rooster': the timetable your choices give, before you save them. Tap a lesson for
 * 'Ik volg dit vak niet' (asking what you mean when that's not clear), or 'Ik mis een les' to find what
 * your classes have at a time you know you have class. Everything changes the choices on the screen
 * behind; nothing is saved until you press Klaar there.
 */
export function PreviewSheet({ visible, onClose, schoolId, sources, choices, setChoices, terms, onRemoveClass }: { visible: boolean; onClose: () => void; schoolId: number | null; sources: Source[]; choices: Choices; setChoices: (f: (c: Choices) => Choices) => void; terms?: Terms; onRemoveClass: (id: number) => void }) {
  const { t, lang } = useT();
  const [week, setWeek] = useState(startWeek);
  const [view, setView] = useState<View_>({ kind: 'week' });
  const sem = semesterOf(week, terms);
  const active = sources.filter((s) => inSemester(s, sem));
  const { bySource, loading } = useWeekLessons(schoolId, active, week);
  const found = preview(active, bySource, choices);

  function close() {
    onClose();
    setView({ kind: 'week' });
  }

  let body;
  if (view.kind === 'lesson') {
    body = <DropView lesson={view.lesson} sources={active} lessons={bySource} choices={choices} setChoices={setChoices} onRemoveClass={onRemoveClass} onDone={() => setView({ kind: 'week' })} t={t} lang={lang} />;
  } else if (view.kind === 'missing') {
    body = <MissingView week={week} sources={active} lessons={bySource} choices={choices} setChoices={setChoices} onDone={() => setView({ kind: 'week' })} onAddClass={() => { close(); router.push('/onboarding/classes'); }} t={t} lang={lang} />;
  } else {
    body = (
      <>
        <WeekNav week={week} onChange={setWeek} lang={lang} sem={sem} />
        {loading && found.length === 0 ? (
          <Skeleton className="h-64 rounded-card" />
        ) : active.length === 0 ? (
          <Text tone="ink2">{t('preview.noClass')}</Text>
        ) : (
          <WeekView
            monday={week}
            lessons={found.map(toLesson)}
            todayIso={isoDay(new Date())}
            nowMin={null}
            pxPerHour={30}
            dim={() => false}
            onPressLesson={(l) => {
              const hit = found.find((x) => x.day === l.day && x.course === l.course && x.start >= l.start && x.start < l.end);
              if (hit) setView({ kind: 'lesson', lesson: hit });
            }}
          />
        )}
        <Text variant="sm" tone="ink2">
          {t('preview.tapHint')}
        </Text>
        <Button variant="secondary" icon="search" label={t('preview.missing')} onPress={() => setView({ kind: 'missing' })} />
      </>
    );
  }

  return (
    <Sheet visible={visible} onClose={close} closeLabel={t('common.close')} title={t('preview.title')} sub={t('preview.sub')}>
      <AView key={view.kind} entering={enter} exiting={exit} className="gap-4">
        {body}
      </AView>
    </Sheet>
  );
}

function DropView({ lesson, sources, lessons, choices, setChoices, onRemoveClass, onDone, t, lang }: { lesson: ClassLesson & { source: number }; sources: Source[]; lessons: Record<number, ClassLesson[]>; choices: Choices; setChoices: (f: (c: Choices) => Choices) => void; onRemoveClass: (id: number) => void; onDone: () => void; t: T; lang: Lang }) {
  const a = dropAnalysis(lesson.course, lesson, sources, lessons, choices);
  const byId = new Map(sources.map((s) => [s.id, s]));
  const where = sources.filter((s) => (lessons[s.id] ?? []).some((l) => l.course === lesson.course)).map((s) => s.label);

  function drop(o: DropOption) {
    setChoices((c) => {
      const next = { ...c };
      for (const id of o.sources) next[id] = setOn(next[id] ?? { include: [] }, lesson.course, false);
      return next;
    });
    onDone();
  }

  function optionLabel(o: DropOption) {
    if (o.key === 'all') return t('preview.dropEverywhere');
    if (o.key === 'both') return t('preview.dropBoth');
    if (o.key === 'sem') return t('preview.dropSemester', { n: o.label.semester ?? 1 });
    if (a.options.length === 1) return t('preview.drop');
    return t('preview.dropIn', { name: `${o.label.name}${o.label.semester ? ` (S${o.label.semester})` : ''}` });
  }

  return (
    <>
      <View className="flex-row items-center gap-2">
        <IconButton icon="back" label={t('common.back')} onPress={onDone} />
        <View className="flex-1">
          <Text variant="sheet">{lesson.course}</Text>
          <Text variant="sm" tone="ink2">
            {[shortDate(new Date(lesson.day + 'T12:00:00'), lang), range(lesson.start, lesson.end), lesson.location].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <Card>
        <Row first title={t('preview.inClasses')} right={<Text tone="ink2">{[...new Set(where)].join(', ')}</Text>} />
        {lesson.group ? <Row title={t('preview.group')} right={<Text tone="ink2">{lesson.group}</Text>} /> : null}
      </Card>
      {a.options.length > 1 ? (
        <Text bold>{t('preview.whichOne')}</Text>
      ) : null}
      <AView layout={layout} className="gap-2">
        {a.options.map((o) => (
          <Button key={o.key} variant={o.key === 'all' || o.key === 'both' || a.options.length === 1 ? 'danger' : 'secondary'} label={optionLabel(o)} onPress={() => drop(o)} />
        ))}
      </AView>
      {a.groups.length > 1 ? (
        <Text variant="sm" tone="ink2">
          {t('preview.groups', { groups: a.groups.join(', ') })}
        </Text>
      ) : null}
      {a.exams ? (
        <Text variant="sm" tone="ink2">
          {t('preview.exams')}
        </Text>
      ) : null}
      {a.emptied.map((s) => (
        <View key={s.id} className="gap-2 bg-surface-sunken rounded-card p-3">
          <Text variant="sm">{t('preview.emptied', { name: byId.get(s.id)?.label ?? '' })}</Text>
          <Button
            variant="secondary"
            size="sm"
            icon="trash"
            label={t('preview.removeClass', { name: s.label })}
            onPress={() => {
              onRemoveClass(s.id);
              onDone();
            }}
          />
        </View>
      ))}
    </>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i);

function MissingView({ week, sources, lessons, choices, setChoices, onDone, onAddClass, t, lang }: { week: Date; sources: Source[]; lessons: Record<number, ClassLesson[]>; choices: Choices; setChoices: (f: (c: Choices) => Choices) => void; onDone: () => void; onAddClass: () => void; t: T; lang: Lang }) {
  const days = Array.from({ length: 5 }, (_, i) => addDays(week, i));
  const [day, setDay] = useState(isoDay(days[0]));
  const [from, setFrom] = useState(9);
  const [to, setTo] = useState(11);
  const results = missing(day, from * 60, to * 60, sources, lessons, choices);
  const byId = new Map(sources.map((s) => [s.id, s]));
  return (
    <>
      <View className="flex-row items-center gap-2">
        <IconButton icon="back" label={t('common.back')} onPress={onDone} />
        <View className="flex-1">
          <Text variant="sheet">{t('preview.missing')}</Text>
          <Text variant="sm" tone="ink2">
            {t('preview.missingSub')}
          </Text>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel={t('preview.day')}>
        {days.map((d) => (
          <Chip key={isoDay(d)} label={`${weekdayShort(d, lang)} ${d.getDate()}`} state={isoDay(d) === day ? 'on' : 'default'} onPress={() => setDay(isoDay(d))} />
        ))}
      </View>
      <HourPicker label={t('preview.from')} value={from} onChange={(h) => { setFrom(h); if (to <= h) setTo(h + 1); }} max={18} />
      <HourPicker label={t('preview.to')} value={to} onChange={(h) => { setTo(h); if (from >= h) setFrom(h - 1); }} min={9} />
      <AView layout={layout} className="gap-2">
        {results.length === 0 ? (
          <AView entering={enter} className="gap-2">
            <Text tone="ink2">{t('preview.nothingThere', { from: hhmm(from * 60), to: hhmm(to * 60) })}</Text>
            <Button variant="secondary" icon="plus" label={t('preview.addClass')} onPress={onAddClass} />
          </AView>
        ) : (
          <Card>
            {results.map((l, i) => (
              <Row
                key={`${l.source}:${l.course}`}
                first={i === 0}
                title={l.course}
                sub={[range(l.start, l.end), l.location, byId.get(l.source)?.label].filter(Boolean).join(' · ')}
                right={
                  l.on ? (
                    <Tag kind="ok" icon="check">
                      {t('preview.already')}
                    </Tag>
                  ) : (
                    <Button
                      variant="tonal"
                      size="sm"
                      icon="plus"
                      label={t('preview.add')}
                      onPress={() => setChoices((c) => ({ ...c, [l.source]: setOn(c[l.source] ?? { include: [] }, l.course, true) }))}
                    />
                  )
                }
              />
            ))}
          </Card>
        )}
      </AView>
    </>
  );
}

function HourPicker({ label, value, onChange, min = 8, max = 19 }: { label: string; value: number; onChange: (h: number) => void; min?: number; max?: number }) {
  return (
    <View className="gap-1.5">
      <Text variant="sm" bold tone="ink2">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-1.5" accessibilityRole="radiogroup" accessibilityLabel={label}>
        {HOURS.filter((h) => h >= min && h <= max).map((h) => (
          <Chip key={h} label={String(h)} state={h === value ? 'on' : 'default'} onPress={() => onChange(h)} accessibilityLabel={`${label} ${hhmm(h * 60)}`} />
        ))}
      </View>
    </View>
  );
}
