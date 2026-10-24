import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { Friend, Lesson, Together } from '@/api/types';
import { Avatar, Tag } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Card, Row } from '@/components/ui/Layout';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { hhmm, isoDay, parseDay, range, shortDate } from '@/lib/time';

import { isOff, KIND_LABEL, lessonKind } from './Timetable';

type Props = {
  lesson: Lesson | null;
  onClose: () => void;
  /** Friends and shared breaks of that day, for "Kayra is ook vrij" */
  friends?: Friend[];
  together?: Together[];
};

/** Tap on a lesson: when, what, where, and who else is free if it's cancelled. */
export function LessonSheet({ lesson, onClose, friends = [], together = [] }: Props) {
  const { t, lang } = useT();
  // Keep showing the last lesson while the sheet slides away
  const [last, setLast] = useState(lesson);
  if (lesson && lesson !== last) setLast(lesson);
  const l = lesson ?? last;
  if (!l) return null;
  const off = isOff(l);
  const day = parseDay(l.day);
  const when = l.day === isoDay(new Date()) ? t('today.title') : shortDate(day, lang);
  const kind = t(KIND_LABEL[lessonKind(l)]);
  const byId = new Map(friends.map((f) => [f.id, f]));
  // Friends free while this lesson would have been
  const alsoFree = off ? together.filter((s) => s.start < l.end && l.start < s.end && byId.has(s.id)) : [];
  return (
    <Sheet
      visible={!!lesson}
      onClose={onClose}
      closeLabel={t('common.close')}
      title={l.course ?? t('tt.lesson')}
      sub={off ? t('tt.cancelled') : l.state === 'changed' ? t('tt.changed') : l.state === 'exam' ? t('tt.exam') : undefined}
    >
      <Card>
        <Row first title={t('lesson.when')} right={<Text>{`${when} ${range(l.start, l.end)}`}</Text>} />
        <Row title={t('lesson.kind')} right={<Text>{[kind, l.location].filter(Boolean).join(' · ')}</Text>} />
        {l.state && l.state !== 'normal' ? (
          <Row
            title={t('lesson.state')}
            right={<Tag kind={off ? 'bad' : l.state === 'exam' ? 'ink' : 'neutral'}>{t(off ? 'tt.cancelled' : l.state === 'exam' ? 'tt.exam' : l.state === 'extra' ? 'change.new' : 'tt.changed')}</Tag>}
          />
        ) : null}
      </Card>
      {off ? (
        <View className="gap-2">
          <Text bold>{t('lesson.whatNow')}</Text>
          {alsoFree.length ? (
            <Card>
              {alsoFree.map((s, i) => {
                const f = byId.get(s.id)!;
                return (
                  <Row
                    key={`${s.id}-${s.start}`}
                    first={i === 0}
                    left={<Avatar name={f.display_name} color={f.avatar_color} />}
                    title={t('lesson.alsoFree', { name: f.display_name })}
                    sub={t('lesson.until', { t: hhmm(s.end) })}
                    chevron
                    onPress={() => {
                      onClose();
                      router.push(`/friends/${f.id}`);
                    }}
                  />
                );
              })}
            </Card>
          ) : (
            <Text tone="ink2">{t('lesson.nobodyFree')}</Text>
          )}
        </View>
      ) : null}
      <Button variant="secondary" label={t('common.close')} onPress={onClose} />
    </Sheet>
  );
}
