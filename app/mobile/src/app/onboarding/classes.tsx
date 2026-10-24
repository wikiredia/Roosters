import { router, useLocalSearchParams } from 'expo-router';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { type ScrollView, useWindowDimensions, View } from 'react-native';

import { useAddClass, useClasses, useCourses, useMe, useSources } from '@/api/hooks';
import type { SchoolClass, Semester, Terms } from '@/api/types';
import { Chip, Tag } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Inputs';
import { Card, Row, Section, SectionHead } from '@/components/ui/Layout';
import { AView, enter, exit } from '@/components/ui/Motion';
import { Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { type Lang, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useFinishOnboarding } from '@/lib/onboarding';
import { monthSpan, parseDay } from '@/lib/time';

const SEMESTERS: Semester[] = [1, 2];
/** One pick: a class in one semester ("12:1"). The same class in S1 and S2 is two picks (two sources). */
type Pick = `${number}:${Semester}`;
const pick = (id: number, s: Semester): Pick => `${id}:${s}`;
const parse = (p: Pick) => {
  const [id, s] = p.split(':');
  return { id: Number(id), semester: Number(s) as Semester };
};

/** Step 3: your classes, per semester (S1 and S2 can differ). Also used from Ik → Roosterbronnen (from=settings). */
export default function ClassesStep() {
  const { t, lang } = useT();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const settings = from === 'settings';
  const me = useMe();
  const classes = useClasses(me.data?.school_id ?? null);
  const sources = useSources();
  const add = useAddClass();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Pick[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Searching on a phone: the field goes to the top with the results under it, above the keyboard
  // (below the semester sections it sat mid-screen, and the keyboard hid every result)
  const scroll = useRef<ScrollView>(null);
  const searchY = useRef(0);
  const [searching, setSearching] = useState(false);
  const screenH = useWindowDimensions().height;
  const toSearch = () => setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, searchY.current), animated: true }), 60);
  const { finish } = useFinishOnboarding();
  // Untis lists every class in both semesters; where its courses are tells which one it really runs in.
  // `only`: class → the one semester it has courses in (from the course scan, see ClassProbe)
  const [only, setOnly] = useState<Map<number, Semester>>(new Map());
  // Classes picked with a tap on the row: those picks follow `only` once it's known
  const auto = useRef(new Set<number>());
  const [hint, setHint] = useState<{ id: number; semester: Semester } | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(hintTimer.current), []);

  // Already followed; a class for the whole year (from before semesters) counts in both
  const have = useMemo(() => {
    const out = new Set<Pick>();
    for (const s of sources.data ?? []) {
      if (s.kind !== 'untis' || !s.class_id) continue;
      for (const sem of s.semester ? [s.semester] : SEMESTERS) out.add(pick(s.class_id, sem));
    }
    return out;
  }, [sources.data]);
  const list = useMemo(() => classes.data?.classes ?? [], [classes.data]);
  const byId = useMemo(() => new Map(list.map((c) => [c.id, c])), [list]);
  const needle = q.trim().toLowerCase();
  const shown = list.filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.long_name.toLowerCase().includes(needle)).slice(0, 60);
  // A Set: right after saving, a pick is in `have` and still in `picked` (it used to show up twice)
  const chosen = useMemo(() => new Set<Pick>([...have, ...picked]), [have, picked]);
  const todo = picked.filter((p) => !have.has(p));

  function toggle(p: Pick) {
    if (have.has(p) || saving) return;
    setPicked((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));
  }

  /** A chip in the list: the other semester of a one-semester class still toggles, with a short hint why it's odd. */
  function toggleChip(c: SchoolClass, sem: Semester) {
    const p = pick(c.id, sem);
    const one = only.get(c.id);
    if (one && one !== sem && !chosen.has(p)) {
      clearTimeout(hintTimer.current);
      setHint({ id: c.id, semester: one });
      hintTimer.current = setTimeout(() => setHint(null), 2500);
    }
    toggle(p);
  }

  /** The course scan of a picked class found courses in one semester only: its row picks go to that one. */
  function found(id: number, semester: Semester) {
    if (only.get(id) === semester) return;
    setOnly((m) => new Map(m).set(id, semester));
    if (!auto.current.has(id)) return;
    const other = pick(id, semester === 1 ? 2 : 1);
    if (!have.has(other)) setPicked((xs) => xs.filter((x) => x !== other));
  }

  /** Tap on the row: the class in every semester it exists in, or out of all of them again. */
  function toggleRow(c: SchoolClass) {
    if (saving) return;
    const one = only.get(c.id);
    const open = c.semesters.filter((s) => !one || s === one).map((s) => pick(c.id, s)).filter((p) => !have.has(p));
    if (open.length === 0) return;
    const allOn = open.every((p) => picked.includes(p));
    if (allOn) auto.current.delete(c.id);
    else auto.current.add(c.id);
    setPicked((xs) => (allOn ? xs.filter((x) => !open.includes(x)) : [...xs, ...open.filter((p) => !xs.includes(p))]));
  }

  async function next() {
    setError(null);
    setSaving(true);
    try {
      for (const p of todo) {
        const { id, semester } = parse(p);
        try {
          await add.mutateAsync({ class_id: id, semester });
        } catch (e) {
          // Saved already (a retry after bad wifi): fine
          if (!(e instanceof ApiError && e.status === 409)) throw e;
        }
      }
      setPicked([]);
      if (settings) router.back();
      else router.push('/onboarding/courses');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.tryAgain'));
    } finally {
      setSaving(false);
    }
  }

  const label = settings ? t('classes.add', { n: todo.length }) : t('classes.next', { n: chosen.size });
  return (
    <Screen
      scrollRef={scroll}
      back
      progress={settings ? undefined : [3, 6]}
      navRight={settings ? undefined : <Button variant="ghost" size="sm" label={t('common.skip')} onPress={finish} />}
      navTitle={settings ? t('classes.addTitle') : undefined}
      footer={<Button label={label} disabled={settings ? todo.length === 0 : chosen.size === 0} loading={saving} onPress={next} />}
    >
      {[...new Set(picked.map((p) => parse(p).id))].map((id) => (
        <ClassProbe key={id} school={me.data?.school_id ?? null} id={id} current={classes.data?.terms.current ?? null} onFound={found} />
      ))}
      <View className="gap-2">
        <Text variant="title" accessibilityRole="header">
          {t('classes.title')}
        </Text>
        <Text tone="ink2">{t('classes.body')}</Text>
      </View>
      {SEMESTERS.map((sem) => (
        <SemesterPicks
          key={sem}
          semester={sem}
          terms={classes.data?.terms}
          picks={[...chosen].filter((p) => parse(p).semester === sem)}
          have={have}
          name={(id) => byId.get(id)?.name ?? '…'}
          onRemove={toggle}
          lang={lang}
        />
      ))}
      <View onLayout={(e) => (searchY.current = e.nativeEvent.layout.y)}>
        <Input
          icon="search"
          placeholder={t('classes.search')}
          accessibilityLabel={t('classes.search')}
          value={q}
          onChangeText={(v) => {
            setQ(v);
            toSearch();
          }}
          onFocus={() => {
            setSearching(true);
            toSearch();
          }}
          onBlur={() => setSearching(false)}
          autoCorrect={false}
          autoCapitalize="characters"
          returnKeyType="search"
        />
      </View>
      {error ? (
        <Text variant="sm" tone="danger">
          {error}
        </Text>
      ) : null}
      <Card>
        {classes.isPending ? (
          <View className="p-4 gap-3">
            <Skeleton className="w-1/2" />
            <Skeleton className="w-2/3" />
            <Skeleton className="w-1/3" />
          </View>
        ) : shown.length === 0 ? (
          <Row first title={t('classes.none')} sub={t('classes.noneBody')} />
        ) : (
          shown.map((c, i) => (
            <Fragment key={c.id}>
              <Row
                first={i === 0}
                title={c.name}
                sub={c.long_name || undefined}
                onPress={() => toggleRow(c)}
                accessibilityRole="button"
                accessibilityHint={t('classes.rowHint')}
                right={
                  <View className="flex-row gap-1.5">
                    {SEMESTERS.map((sem) => {
                      // Keep S1 and S2 in their own column, also for a class that exists in one semester only
                      if (!c.semesters.includes(sem)) return <View key={sem} style={{ width: 52 }} />;
                      const p = pick(c.id, sem);
                      const on = chosen.has(p);
                      return (
                        <Chip
                          key={sem}
                          label={t(sem === 1 ? 'classes.s1' : 'classes.s2')}
                          state={on ? 'on' : 'default'}
                          icon={on ? 'check' : undefined}
                          accessibilityLabel={t('classes.inSemester', { name: c.name, n: sem })}
                          onPress={() => toggleChip(c, sem)}
                        />
                      );
                    })}
                  </View>
                }
              />
              {hint?.id === c.id ? (
                <AView entering={enter} exiting={exit} className="px-4 pb-3 items-end" accessibilityLiveRegion="polite">
                  <View className="rounded-chip bg-surface-sunken px-2.5 py-1">
                    <Text variant="xs" tone="ink2">
                      {t('classes.onlyIn', { n: hint.semester })}
                    </Text>
                  </View>
                </AView>
              ) : null}
            </Fragment>
          ))
        )}
      </Card>
      {/* Room under a short result list, so the search field can still scroll up to the top */}
      {searching ? <View style={{ height: screenH * 0.6 }} /> : null}
    </Screen>
  );
}

function SemesterPicks({ semester, terms, picks, have, name, onRemove, lang }: { semester: Semester; terms?: Terms; picks: Pick[]; have: Set<Pick>; name: (id: number) => string; onRemove: (p: Pick) => void; lang: Lang }) {
  const { t } = useT();
  const range = terms ? terms[semester === 1 ? 's1' : 's2'] : null;
  return (
    <Section className="gap-2" accessibilityLabel={t('classes.chosenIn', { n: semester })}>
      <SectionHead
        title={t('classes.semester', { n: semester })}
        left={terms?.current === semester ? <Tag kind="you">{t('classes.now')}</Tag> : undefined}
        aside={
          range ? (
            <Text variant="sm" tone="ink2">
              {monthSpan(parseDay(range.start), parseDay(range.end), lang)}
            </Text>
          ) : undefined
        }
      />
      {picks.length ? (
        <View className="flex-row flex-wrap gap-2">
          {picks.map((p) => {
            const { id } = parse(p);
            const saved = have.has(p);
            return (
              <Chip
                key={p}
                state="on"
                label={name(id)}
                icon={saved ? 'check' : 'close'}
                accessibilityLabel={saved ? name(id) : t('classes.remove', { name: name(id) })}
                onPress={() => onRemove(p)}
              />
            );
          })}
        </View>
      ) : (
        <Text variant="sm" tone="ink2">
          {t('classes.noneYet')}
        </Text>
      )}
    </Section>
  );
}

/**
 * Asks for a picked class's courses (the API starts its course scan) and tells when they're all in one
 * semester. The scan starts in the current semester and moves to the other when the class has nothing now,
 * so courses found only in the other semester already decide it; otherwise it waits for the scan to end.
 */
function ClassProbe({ school, id, current, onFound }: { school: number | null; id: number; current: Semester | null; onFound: (id: number, s: Semester) => void }) {
  const q = useCourses(school, id);
  const d = q.data;
  const sems = new Set((d?.courses ?? []).flatMap((c) => c.semesters ?? []));
  const one = sems.size === 1 ? [...sems][0] : null;
  const sure = !!d && !d.syncing && !d.error && (!d.scanning || (current !== null && one !== null && one !== current));
  const decided = sure ? one : null;
  useEffect(() => {
    if (decided) onFound(id, decided);
  }, [decided, id, onFound]);
  return null;
}
