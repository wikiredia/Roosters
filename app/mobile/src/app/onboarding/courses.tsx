import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useClasses, useCourses, useDeleteSource, useMe, useSources, useUpdateSource } from '@/api/hooks';
import type { Semester, Source, Terms } from '@/api/types';
import { Chip, Tag } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Section, SectionHead } from '@/components/ui/Layout';
import { Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { type Lang, useT } from '@/i18n';
import { useFinishOnboarding } from '@/lib/onboarding';
import { monthSpan, parseDay } from '@/lib/time';

const SEMESTERS: Semester[] = [1, 2];

/** Step 4: per semester, every course of your classes this school year (not only the coming weeks);
 * all on, tap the ones you don't take. From settings (source=<id>) for one class. */
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
  const classes = (sources.data ?? []).filter((s) => s.kind === 'untis' && (!onlySource || String(s.id) === onlySource));
  const [excluded, setExcluded] = useState<Record<number, string[]>>({});
  const { finish } = useFinishOnboarding();

  useEffect(() => {
    // Start from what is saved (coming back to this step keeps your choices)
    setExcluded((prev) => {
      const next = { ...prev };
      for (const s of classes) if (!(s.id in next)) next[s.id] = s.config.exclude ?? [];
      return next;
    });
  }, [sources.data]);

  async function save() {
    for (const s of classes) {
      const exclude = excluded[s.id] ?? [];
      if (JSON.stringify(exclude) !== JSON.stringify(s.config.exclude ?? []) || (s.config.include ?? []).length) {
        await update.mutateAsync({ id: s.id, exclude, include: [] });
      }
    }
    if (settings) router.back();
    else router.push('/onboarding/week');
  }

  async function removeClass(id: number) {
    await del.mutateAsync(id);
    router.back();
  }

  // A class for the whole year (from before semesters) shows in both; its choices count for both
  const semesters = SEMESTERS.filter((sem) => !onlySource || classes.some((s) => !s.semester || s.semester === sem));
  return (
    <Screen
      back
      progress={settings ? undefined : [4, 6]}
      navRight={settings ? undefined : <Button variant="ghost" size="sm" label={t('common.skip')} onPress={finish} />}
      navTitle={settings ? t('courses.editTitle') : undefined}
      footer={<Button label={settings ? t('common.save') : t('courses.next')} loading={update.isPending} onPress={save} disabled={classes.length === 0} />}
    >
      <View className="gap-2">
        <Text variant="title" accessibilityRole="header">
          {t('courses.title')}
        </Text>
        <Text tone="ink2">{t('courses.body')}</Text>
      </View>
      {semesters.map((sem) => {
        const inSem = classes.filter((s) => !s.semester || s.semester === sem);
        return (
          <View key={sem} className="gap-4">
            <SemesterHead semester={sem} terms={terms} lang={lang} />
            {inSem.length === 0 ? (
              <Text variant="sm" tone="ink2">
                {t('courses.noClass')}
              </Text>
            ) : (
              inSem.map((s) => (
                <ClassCourses
                  key={`${sem}:${s.id}`}
                  source={s}
                  semester={sem}
                  schoolId={schoolId}
                  excluded={excluded[s.id] ?? []}
                  onChange={(list) => setExcluded((p) => ({ ...p, [s.id]: list }))}
                />
              ))
            )}
          </View>
        );
      })}
      <Text variant="sm" tone="ink2">
        {t('courses.hiddenNote')}
      </Text>
      {settings && classes.length === 1 ? (
        <Button variant="secondary" icon="trash" label={t('courses.removeClass')} loading={del.isPending} onPress={() => removeClass(classes[0].id)} />
      ) : null}
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

function ClassCourses({ source, semester, schoolId, excluded, onChange }: { source: Source; semester: Semester; schoolId: number | null; excluded: string[]; onChange: (l: string[]) => void }) {
  const { t } = useT();
  const courses = useCourses(schoolId, source.class_id ?? 0, semester);
  const list = courses.data?.courses ?? [];
  const on = list.filter((c) => !excluded.includes(c.name)).length;
  return (
    <Section>
      <SectionHead title={source.label} aside={list.length ? t('courses.count', { on, of: list.length }) : undefined} />
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
          <View className="flex-row flex-wrap gap-2">
            {list.map((c) => {
              const off = excluded.includes(c.name);
              return (
                <Chip
                  key={c.name}
                  label={c.name}
                  state={off ? 'off' : 'sel'}
                  icon={off ? 'plus' : 'check'}
                  accessibilityLabel={`${c.name}, ${off ? t('courses.off') : t('courses.on')}`}
                  onPress={() => onChange(off ? excluded.filter((x) => x !== c.name) : [...excluded, c.name])}
                />
              );
            })}
            {courses.data?.scanning ? <Skeleton width={110} className="h-11 rounded-chip" /> : null}
          </View>
          {courses.data?.scanning ? (
            <Text variant="sm" tone="ink2" accessibilityLiveRegion="polite">
              {t('courses.scanning')}
            </Text>
          ) : courses.data?.error ? (
            <Text variant="sm" tone="ink2">
              {t('courses.scanFailed')}
            </Text>
          ) : null}
        </View>
      )}
    </Section>
  );
}
