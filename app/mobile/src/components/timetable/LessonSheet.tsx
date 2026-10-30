import { router } from 'expo-router';
import { memo, useState } from 'react';
import { View } from 'react-native';

import { useDetails, useOpenDirect } from '@/api/hooks';
import type { Friend, Lesson, Together } from '@/api/types';
import { Avatar, Tag } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Card, Row } from '@/components/ui/Layout';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { detailRows, layoutFor } from '@/lib/details';
import { canSkip } from '@/lib/skips';
import { hhmm, isoDay, nowMin, parseDay, range, shortDate } from '@/lib/time';

import { isFree, isOff, KIND_LABEL, KIND_STYLE, lessonKind } from './Timetable';

type Props = {
  lesson: Lesson | null;
  onClose: () => void;
  /** Friends and shared breaks of that day, for "Kayra is ook vrij" */
  friends?: Friend[];
  together?: Together[];
  /** 'Skip this class' (one that's still to come), and 'I'll go after all' on one you skip. Without: neither. */
  onSkip?: (l: Lesson) => void;
  onUnskip?: (l: Lesson) => void;
};

/** Tap on a lesson: when, its details (Type, Building, Floor, Classroom, ... after the layout of its origin, lib/details.ts),
 * who else is free if it's cancelled or you skip it, and skipping it.
 * Memo (like the other two sheets of the calendar): opening it renders this sheet and nothing else, as long as the
 * callbacks it gets keep their identity. */
export const LessonSheet = memo(function LessonSheet({ lesson, onClose, friends = [], together = [], onSkip, onUnskip }: Props) {
  const { t, lang } = useT();
  const details = useDetails();
  const open = useOpenDirect();
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
  const free = isFree(l);
  const skippable = !!onSkip && canSkip(l, isoDay(new Date()), nowMin());
  // Friends free while this lesson would have been
  const alsoFree = free ? together.filter((s) => s.start < l.end && l.start < s.end && byId.has(s.id)) : [];
  return (
    <Sheet
      visible={!!lesson}
      onClose={onClose}
      closeLabel={t('common.close')}
      title={l.course ?? t('tt.lesson')}
      sub={off ? t('tt.cancelled') : l.skipped ? t('tt.skipped') : l.state === 'changed' ? t('tt.changed') : l.state === 'exam' ? t('tt.exam') : undefined}
    >
      <Card>
        <Row first title={t('lesson.when')} right={<Text>{`${when} ${range(l.start, l.end)}`}</Text>} />
        {detailRows(l, kind, layoutFor(l.origin, details.data), t).map((r) => (
          <Row
            key={`${r.index}:${r.title}`}
            title={r.title}
            right={
              <Text className="max-w-52 text-right" selectable>
                {r.value}
              </Text>
            }
          />
        ))}
        {l.state && l.state !== 'normal' ? (
          <Row
            title={t('lesson.state')}
            right={<Tag kind={off ? 'bad' : l.state === 'exam' ? 'ink' : 'neutral'}>{t(off ? 'tt.cancelled' : l.state === 'exam' ? 'tt.exam' : l.state === 'extra' ? 'change.new' : 'tt.changed')}</Tag>}
          />
        ) : null}
      </Card>
      {l.skipped ? <Text tone="ink2">{t('lesson.skippedNote')}</Text> : null}
      {free ? (
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
                    left={<Avatar name={f.display_name} color={f.avatar_color} uid={f.id} photo={f.photo} />}
                    title={f.display_name}
                    sub={t('lesson.until', { t: hhmm(s.end) })}
                    chevron
                    // Straight to your chat with them: that's where you'd ask "zullen we?"
                    onPress={async () => {
                      const chat = await open.mutateAsync(f.id);
                      onClose();
                      router.push(`/chat/${chat.id}`);
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
      {l.skipped && onUnskip ? <Button variant="secondary" icon="undo" label={t('lesson.unskip')} onPress={() => onUnskip(l)} /> : null}
      {skippable ? (
        <View className="gap-1.5">
          <Button variant="secondary" icon="trash" label={t('lesson.skip')} onPress={() => onSkip?.(l)} />
          <Text variant="xs" tone="ink3" className="text-center">
            {t('lesson.skipTip')}
          </Text>
        </View>
      ) : null}
      <Button variant={skippable || (l.skipped && onUnskip) ? 'ghost' : 'secondary'} label={t('common.close')} onPress={onClose} />
    </Sheet>
  );
});

/**
 * Lessons that overlap were tapped (or close to where they overlap): which one do you mean? Picking one opens
 * its own sheet (the screen does that). In time order, each with its kind's colour, time and room.
 */
export const OverlapSheet = memo(function OverlapSheet({ choice, onClose, onPick }: { choice: { lessons: Lesson[] } | null; onClose: () => void; onPick: (l: Lesson) => void }) {
  const { t } = useT();
  // Keep showing the last choice while the sheet slides away
  const [last, setLast] = useState(choice);
  if (choice && choice !== last) setLast(choice);
  const lessons = (choice ?? last)?.lessons ?? [];
  return (
    <Sheet visible={!!choice} onClose={onClose} closeLabel={t('common.close')} title={t('tt.whichLesson')}>
      <Card>
        {lessons.map((l, i) => (
          <Row
            key={`${l.start}:${l.course}:${l.location}`}
            first={i === 0}
            title={l.course ?? t('tt.lesson')}
            sub={[range(l.start, l.end), t(KIND_LABEL[lessonKind(l)]), l.location].filter(Boolean).join(' · ')}
            left={<View className={cn('w-3 h-9 rounded-full border-[1.5px]', KIND_STYLE[lessonKind(l)])} />}
            chevron
            accessibilityRole="button"
            onPress={() => onPick(l)}
          />
        ))}
      </Card>
    </Sheet>
  );
});
