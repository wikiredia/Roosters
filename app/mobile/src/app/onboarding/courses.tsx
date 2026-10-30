import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAddClass, useClasses, useCourses, useDeleteSource, useMe, useSources, useUpdateSource } from '@/api/hooks';
import type { Semester, Source, Terms } from '@/api/types';
import { ClassWeekSheet, PreviewSheet } from '@/components/onboarding/CoursePreview';
import { Chip, Tag } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Card, Row, Section, SectionHead } from '@/components/ui/Layout';
import { AView, enter, layout } from '@/components/ui/Motion';
import { Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { type Lang, useT } from '@/i18n';
import { type Choice, type Choices, countOn, initialChoice, isOn, setAll, setOn, toConfig } from '@/lib/choices';
import { confirm } from '@/lib/confirm';
import { useFinishOnboarding } from '@/lib/onboarding';
import { monthSpan, parseDay } from '@/lib/time';

const SEMESTERS: Semester[] = [1, 2];

/** Step 5 (then 6, checking your lessons' details): per semester, every course of your classes this school year (not only the coming weeks).
 * Nothing is chosen until you choose it: tap courses, 'Alles kiezen' per class, or tap lessons in the
 * class's own timetable. 'Bekijk gevonden rooster' shows the timetable your choices give before you save.
 * From settings (source=<id>) for one class, starting from what's saved. */
export default function CoursesStep() {
  const { t, lang } = useT();
  const { source: onlySource, from } = useLocalSearchParams<{ source?: string; from?: string }>();
  const settings = from === 'settings';
  const me = useMe();
  const schoolId = me.data?.school_id ?? null;
  const terms = useClasses(schoolId).data?.terms;
  const sources = useSources();
  const update = useUpdateSource();
  const del = useDeleteSource();
  const add = useAddClass();
  const [adding, setAdding] = useState<string | null>(null);
  const classes = (sources.data ?? []).filter((s) => s.kind === 'untis' && (!onlySource || String(s.id) === onlySource));
  const [choices, setChoices] = useState<Choices>({});
  const [removed, setRemoved] = useState<number[]>([]);
  const [classWeek, setClassWeek] = useState<Source | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { finish } = useFinishOnboarding();
  const shown = classes.filter((s) => !removed.includes(s.id));

  useEffect(() => {
    // Start from what is saved (coming back to this step keeps your choices); a class you just added starts empty
    setChoices((prev) => {
      const next = { ...prev };
      for (const s of classes) if (!(s.id in next)) next[s.id] = initialChoice(s, !settings);
      return next;
    });
  }, [sources.data]);

  async function save() {
    // Following a class without any of its courses means nothing: offer to remove it
    const empty = shown.filter((s) => {
      const c = choices[s.id];
      return !!c && 'include' in c && c.include.length === 0;
    });
    for (const s of empty) {
      if (!(await confirm(t('courses.noneFrom', { name: s.label }), t('courses.noneFromSub'), t('courses.removeIt'), t('common.cancel')))) return;
    }
    setSaving(true);
    try {
      for (const id of [...removed, ...empty.map((s) => s.id)]) await del.mutateAsync(id);
      for (const s of shown) {
        if (empty.some((e) => e.id === s.id)) continue;
        const c = choices[s.id];
        if (!c) continue;
        const cfg = toConfig(c);
        const was = s.config;
        if (JSON.stringify([cfg.include, cfg.exclude, cfg.picked]) !== JSON.stringify([was.include ?? [], was.exclude ?? [], !!was.picked])) {
          await update.mutateAsync({ id: s.id, ...cfg });
        }
      }
    } finally {
      setSaving(false);
    }
    if (settings) router.back();
    else router.push('/onboarding/details');
  }

  async function removeClass(id: number) {
    await del.mutateAsync(id);
    router.back();
  }

  /** A class you follow in the other semester only: follow it in this one too (its courses show up here). */
  async function alsoIn(s: Source, sem: Semester) {
    if (!s.class_id) return;
    setAdding(`${s.class_id}:${sem}`);
    try {
      await add.mutateAsync({ class_id: s.class_id, semester: sem });
    } catch {
      // A 409 (already there after a retry) or no network: the sources list tells the truth after the refetch
    } finally {
      setAdding(null);
    }
  }

  const set = (id: number, c: Choice) => setChoices((p) => ({ ...p, [id]: c }));
  // A class for the whole year (from before semesters) shows in both; its choices count for both
  const semesters = SEMESTERS.filter((sem) => !onlySource || shown.some((s) => !s.semester || s.semester === sem));
  return (
    <Screen
      back
      progress={settings ? undefined : [5, 9]}
      navRight={settings ? undefined : <Button variant="ghost" size="sm" label={t('common.skip')} onPress={finish} />}
      navTitle={settings ? t('courses.editTitle') : undefined}
      footer={
        <>
          <Button variant="secondary" icon="calendar" label={t('courses.preview')} disabled={shown.length === 0} onPress={() => setPreviewing(true)} />
          <Button label={settings ? t('common.save') : t('courses.next')} loading={saving} onPress={save} disabled={shown.length === 0} />
        </>
      }
    >
      <View className="gap-2">
        <Text variant="title" accessibilityRole="header">
          {t('courses.title')}
        </Text>
        <Text tone="ink2">{t('courses.body')}</Text>
      </View>
      {semesters.map((sem) => {
        const inSem = shown.filter((s) => !s.semester || s.semester === sem);
        // Followed in the other semester only: one tap to take its courses in this one as well
        const elsewhere = shown.filter((s) => s.semester && s.semester !== sem && !inSem.some((o) => o.class_id === s.class_id));
        return (
          <View key={sem} className="gap-4">
            <SemesterHead semester={sem} terms={terms} lang={lang} />
            {inSem.length === 0 ? (
              <Text variant="sm" tone="ink2">
                {t('courses.noClass')}
              </Text>
            ) : (
              inSem.map((s) => (
                <ClassCourses key={`${sem}:${s.id}`} source={s} semester={sem} schoolId={schoolId} choice={choices[s.id]} onChange={(c) => set(s.id, c)} onWeek={() => setClassWeek(s)} />
              ))
            )}
            {elsewhere.length ? (
              <Card>
                {elsewhere.map((s, i) => (
                  <Row
                    key={s.id}
                    first={i === 0}
                    title={t('courses.alsoTitle', { name: s.label, n: sem })}
                    sub={t('courses.alsoSub', { n: s.semester ?? 1 })}
                    right={<Button variant="secondary" size="sm" icon="plus" label={t('courses.alsoIn')} loading={adding === `${s.class_id}:${sem}`} onPress={() => alsoIn(s, sem)} />}
                  />
                ))}
              </Card>
            ) : null}
          </View>
        );
      })}
      <Text variant="sm" tone="ink2">
        {t('courses.hiddenNote')}
      </Text>
      {settings && shown.length === 1 ? (
        <Button variant="secondary" icon="trash" label={t('courses.removeClass')} loading={del.isPending} onPress={() => removeClass(shown[0].id)} />
      ) : null}
      <ClassWeekSheet source={classWeek} onClose={() => setClassWeek(null)} schoolId={schoolId} choices={choices} setChoices={setChoices} terms={terms} />
      <PreviewSheet
        visible={previewing}
        onClose={() => setPreviewing(false)}
        schoolId={schoolId}
        sources={shown}
        choices={choices}
        setChoices={setChoices}
        terms={terms}
        onRemoveClass={(id) => setRemoved((r) => [...r, id])}
      />
    </Screen>
  );
}

function SemesterHead({ semester, terms, lang }: { semester: Semester; terms?: Terms; lang: Lang }) {
  const { t } = useT();
  const range = terms ? terms[semester === 1 ? 's1' : 's2'] : null;
  return (
    <View className="flex-row items-center gap-2 border-b border-line pb-2">
      <Text variant="eyebrow" accessibilityRole="header">
        {t('classes.semester', { n: semester })}
      </Text>
      {range ? (
        <Text variant="xs" tone="ink3">
          {monthSpan(parseDay(range.start), parseDay(range.end), lang)}
        </Text>
      ) : null}
      {terms?.current === semester ? <Tag kind="you">{t('classes.now')}</Tag> : null}
    </View>
  );
}

function ClassCourses({ source, semester, schoolId, choice, onChange, onWeek }: { source: Source; semester: Semester; schoolId: number | null; choice?: Choice; onChange: (c: Choice) => void; onWeek: () => void }) {
  const { t } = useT();
  const courses = useCourses(schoolId, source.class_id ?? 0, semester);
  const list = courses.data?.courses ?? [];
  const names = list.map((c) => c.name);
  const on = countOn(choice, names);
  const all = list.length > 0 && on === list.length;
  return (
    <Section>
      <SectionHead
        title={source.label}
        aside={
          list.length ? (
            <View className="flex-row items-center gap-2">
              <Text variant="sm" tone="ink2">
                {t('courses.count', { on, of: list.length })}
              </Text>
              <Button variant="ghost" size="sm" label={all ? t('courses.none') : t('courses.all')} onPress={() => onChange(setAll(names, !all))} />
            </View>
          ) : undefined
        }
      />
      {courses.data?.syncing || courses.isPending ? (
        <View className="gap-3">
          <Text variant="sm" tone="ink2">
            {courses.data?.error ? t('courses.untisDown') : t('courses.fetching')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {[90, 130, 110, 150, 80].map((w) => (
              <Skeleton key={w} width={w} className="h-11 rounded-chip" />
            ))}
          </View>
        </View>
      ) : list.length === 0 && !courses.data?.scanning ? (
        <Text variant="sm" tone="ink2">
          {t('courses.empty')}
        </Text>
      ) : (
        <View className="gap-2">
          <AView layout={layout} className="flex-row flex-wrap gap-2">
            {list.map((c) => {
              const sel = isOn(choice, c.name);
              return (
                <AView key={c.name} entering={enter} layout={layout}>
                  <Chip
                    label={c.name}
                    state={sel ? 'sel' : 'default'}
                    icon={sel ? 'check' : 'plus'}
                    accessibilityLabel={`${c.name}, ${sel ? t('courses.on') : t('courses.off')}`}
                    onPress={() => onChange(setOn(choice ?? { include: [] }, c.name, !sel))}
                  />
                </AView>
              );
            })}
            {courses.data?.scanning ? <Skeleton width={110} className="h-11 rounded-chip" /> : null}
          </AView>
          {courses.data?.scanning ? (
            <Text variant="sm" tone="ink2" accessibilityLiveRegion="polite">
              {t('courses.scanning')}
            </Text>
          ) : courses.data?.error ? (
            <Text variant="sm" tone="ink2">
              {t('courses.scanFailed')}
            </Text>
          ) : null}
          <Text variant="sm" bold tone="you" className="underline self-start py-1" accessibilityRole="button" onPress={onWeek}>
            {t('courses.seeClass', { name: source.label })}
          </Text>
        </View>
      )}
    </Section>
  );
}
