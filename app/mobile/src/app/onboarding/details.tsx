import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useDetails, useSaveDetails } from '@/api/hooks';
import type { DetailLayout, DetailOrigin } from '@/api/types';
import { KIND_LABEL, lessonKind } from '@/components/timetable/Timetable';
import { Banner, Tag } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Input, Toggle } from '@/components/ui/Inputs';
import { Card, Row, Section, SectionHead } from '@/components/ui/Layout';
import { Screen, Skeleton } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { detailRows, fieldTitle, keyName, mergeNext, rename, sameLayout, setHidden, unmerge } from '@/lib/details';
import { useFinishOnboarding } from '@/lib/onboarding';

/**
 * Step 6 of 9: is this what your timetable says about a lesson? Per origin (your school's classes, each calendar link)
 * the fields we found in its data (Type, Building, Floor, Classroom, Group, ...; api/roosters/details.py), shown on one
 * of your own lessons. Tap a field to rename it, merge it with the one before or after, split a merge again or hide
 * it; or take over the layout schoolmates use. 'Looks right' saves it (PUT /me/details/<origin>), also when unchanged.
 * From settings (from=settings): the same, saving goes back. The lesson sheet shows lessons this way.
 */
export default function DetailsStep() {
  const { t } = useT();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const settings = from === 'settings';
  const details = useDetails();
  const save = useSaveDetails();
  const { finish } = useFinishOnboarding();
  const origins = details.data ?? [];
  // Your changes per origin until you save; without one, what's saved (or found)
  const [drafts, setDrafts] = useState<Record<string, DetailLayout>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftOf = (o: DetailOrigin) => drafts[o.origin] ?? o.layout;

  async function next() {
    setSaving(true);
    setError(null);
    try {
      for (const o of origins) {
        // Nothing fetched yet and nothing changed: there's nothing to confirm (Settings has this screen for later)
        if (o.syncing && !(o.origin in drafts)) continue;
        const layout = draftOf(o);
        if (!o.saved || !sameLayout(layout, o.layout)) await save.mutateAsync({ origin: o.origin, layout });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.offline'));
      return;
    } finally {
      setSaving(false);
    }
    if (settings) router.back();
    else router.push('/onboarding/week');
  }

  return (
    <Screen
      back
      progress={settings ? undefined : [6, 9]}
      navTitle={settings ? t('details.editTitle') : undefined}
      navRight={settings ? undefined : <Button variant="ghost" size="sm" label={t('common.skip')} onPress={finish} />}
      footer={<Button label={settings ? t('common.save') : t('details.next')} loading={saving} disabled={!details.data} onPress={next} />}
    >
      <View className="gap-2">
        <Text variant="title" accessibilityRole="header">
          {t('details.title')}
        </Text>
        <Text tone="ink2">{t('details.body')}</Text>
      </View>
      {!details.data ? (
        <Card className="p-4 gap-3">
          {[140, 100, 120].map((w) => (
            <Skeleton key={w} width={w} />
          ))}
        </Card>
      ) : origins.length === 0 ? (
        <Text tone="ink2">{t('details.none')}</Text>
      ) : (
        origins.map((o) => (
          <OriginCard key={o.origin} o={o} layout={draftOf(o)} named={origins.length > 1} onChange={(l) => setDrafts((p) => ({ ...p, [o.origin]: l }))} />
        ))
      )}
      {error ? (
        <Text variant="sm" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

/** One origin: what schoolmates use, an example lesson, and its fields with that lesson's values. */
function OriginCard({ o, layout, named, onChange }: { o: DetailOrigin; layout: DetailLayout; named: boolean; onChange: (l: DetailLayout) => void }) {
  const { t } = useT();
  const [ex, setEx] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const example = o.examples.length ? o.examples[ex % o.examples.length] : null;
  const kind = example ? t(KIND_LABEL[lessonKind({ kind: example.kind })]) : null;
  // Values of every field, hidden ones too (you see what you hide)
  const shown: DetailLayout = { ...layout, fields: layout.fields.map((f) => ({ keys: f.keys, ...(f.label ? { label: f.label } : {}) })) };
  const rows = example ? detailRows(example, kind, shown, t) : [];
  const values = new Map(rows.map((r) => [r.index, r.value]));
  const whole = rows.find((r) => r.whole);
  const shared = o.suggested && !sameLayout(o.suggested.layout, layout) ? o.suggested : null;
  return (
    <Section>
      {named ? <SectionHead title={o.name} aside={o.kind === 'ics' ? <Tag>{t('details.link')}</Tag> : undefined} /> : null}
      {o.syncing ? (
        <Text variant="sm" tone="ink2" accessibilityLiveRegion="polite">
          {t('details.fetching')}
        </Text>
      ) : null}
      {shared ? (
        <Banner
          icon="users"
          title={t('details.shared', { n: shared.users })}
          body={t('details.sharedBody')}
          action={<Button variant="secondary" size="sm" label={t('details.useShared')} onPress={() => onChange(shared.layout)} />}
        />
      ) : null}
      {example ? (
        <View className="flex-row items-center gap-2">
          <Text variant="sm" tone="ink2" className="flex-1" numberOfLines={1}>
            {t('details.example', { course: example.course ?? t('tt.lesson') })}
          </Text>
          {o.examples.length > 1 ? <Button variant="ghost" size="sm" icon="refresh" label={t('details.otherExample')} onPress={() => setEx((e) => e + 1)} /> : null}
        </View>
      ) : null}
      <Card>
        {layout.fields.map((f, i) => {
          const parts = f.label || f.keys.length > 1 ? f.keys.map((k) => keyName(k, t)).join(' + ') : null;
          return (
            <Row
              key={f.keys.join('+')}
              first={i === 0}
              title={fieldTitle(f, t)}
              sub={[f.hidden ? t('details.hidden') : null, parts].filter(Boolean).join(' · ') || undefined}
              right={
                <Text tone={f.hidden ? 'ink3' : 'ink'} strike={!!f.hidden} className="max-w-40 text-right" numberOfLines={1}>
                  {values.get(i) ?? '—'}
                </Text>
              }
              chevron
              accessibilityHint={t('details.editHint')}
              onPress={() => setOpen(i)}
            />
          );
        })}
      </Card>
      {whole ? (
        <Text variant="sm" tone="ink2">
          {t('details.wholeNote', { value: whole.value })}
        </Text>
      ) : null}
      {!sameLayout(layout, o.detected) ? (
        <Text variant="sm" bold tone="you" className="underline self-start py-1" accessibilityRole="button" onPress={() => onChange(o.detected)}>
          {t('details.reset')}
        </Text>
      ) : null}
      <FieldSheet layout={layout} index={open} value={open != null ? values.get(open) : undefined} onChange={onChange} onOpen={setOpen} />
    </Section>
  );
}

/** One field: its title, shown or hidden, merging it with the field before or after, splitting a merge. */
function FieldSheet({ layout, index, value, onChange, onOpen }: { layout: DetailLayout; index: number | null; value?: string; onChange: (l: DetailLayout) => void; onOpen: (i: number | null) => void }) {
  const { t } = useT();
  // Keep showing the last field while the sheet slides away
  const [last, setLast] = useState(index);
  if (index != null && index !== last) setLast(index);
  const i = index ?? last;
  const f = i != null ? layout.fields[i] : undefined;
  // The title as you type it (spaces too), applied when you leave the field; it starts over for each field you open
  const [label, setLabel] = useState('');
  const [labelOf, setLabelOf] = useState<number | null>(null);
  if (index != null && index !== labelOf) {
    setLabelOf(index);
    setLabel(layout.fields[index]?.label ?? '');
  }
  if (i == null || !f) return null;
  const prev = i > 0 ? layout.fields[i - 1] : null;
  const next = layout.fields[i + 1] ?? null;
  const named = () => rename(layout, i, label);

  function close() {
    onChange(named());
    setLabelOf(null);
    onOpen(null);
  }

  return (
    <Sheet visible={index != null} onClose={close} closeLabel={t('common.close')} title={fieldTitle({ ...f, label: label.trim() || undefined }, t)} sub={value ? t('details.fieldSub', { value }) : undefined}>
      <Input
        label={t('details.fieldTitle')}
        value={label}
        onChangeText={setLabel}
        placeholder={fieldTitle({ keys: f.keys }, t)}
        hint={t('details.fieldHint')}
        maxLength={24}
        returnKeyType="done"
        onSubmitEditing={close}
      />
      <Card>
        <Row first title={t('details.show')} right={<Toggle label={t('details.show')} value={!f.hidden} onChange={(on) => onChange(setHidden(named(), i, !on))} />} />
      </Card>
      <View className="gap-2">
        {prev ? <Button variant="secondary" icon="plus" label={t('details.mergeWith', { name: fieldTitle(prev, t) })} onPress={() => {
          onChange(mergeNext(named(), i - 1));
          onOpen(i - 1);
        }} /> : null}
        {next ? <Button variant="secondary" icon="plus" label={t('details.mergeWith', { name: fieldTitle(next, t) })} onPress={() => onChange(mergeNext(named(), i))} /> : null}
        {f.keys.length > 1 ? <Button variant="secondary" icon="swap" label={t('details.unmerge')} onPress={() => {
          onChange(unmerge(named(), i));
          onOpen(null);
        }} /> : null}
      </View>
      <Button label={t('details.done')} onPress={close} />
    </Sheet>
  );
}
