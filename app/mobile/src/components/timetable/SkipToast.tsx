import { memo, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { FadeIn, FadeInDown, FadeOut, FadeOutDown, ZoomIn } from 'react-native-reanimated';

import { Icon } from '@/components/ui/Icon';
import { AView, layout } from '@/components/ui/Motion';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import type { SkipChange } from '@/lib/skips';

/** Seconds you can take a skip back. */
export const UNDO_SECONDS = 5;
/** How long the summary stays after that (ms), unless you tap it away. */
const LINGER = 4500;

/** What the toast says: a skip (with what it changes; `changes` grows once the server says who's free), a skip
 * taken back, or a skip that didn't go through. `id` changes per toast, so a new skip starts its own countdown. */
export type SkipNote = { id: number; kind: 'skipped' | 'undone' | 'failed'; course: string; changes: SkipChange[] };

/**
 * The small dark card at the bottom of the calendar after a skip: "Skipped DevOps", a countdown (just 5, 4, 3, 2, 1)
 * with Undo, and below it what the skip changes for you (longer breaks, new ones with friends). It covers only the
 * last hours of the grid, never takes the whole screen, and goes by itself; a tap sends it away sooner.
 * Memo: it renders when the note changes or the countdown ticks, not with the calendar (keep `onUndo` and `onDone` stable).
 */
export const SkipToast = memo(function SkipToast({ note, onUndo, onDone }: { note: SkipNote | null; onUndo: () => void; onDone: () => void }) {
  const { t } = useT();
  const [left, setLeft] = useState(UNDO_SECONDS);
  const id = note?.id;
  const kind = note?.kind;

  useEffect(() => {
    if (id == null) return;
    if (kind !== 'skipped') {
      setLeft(0);
      const done = setTimeout(onDone, 3000);
      return () => clearTimeout(done);
    }
    setLeft(UNDO_SECONDS);
    const tick = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    const done = setTimeout(onDone, UNDO_SECONDS * 1000 + LINGER);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [id, kind]);

  if (!note) return null;
  const title = note.kind === 'skipped' ? t('skip.title', { course: note.course }) : note.kind === 'undone' ? t('skip.undone', { course: note.course }) : t('skip.failed');
  return (
    <AView key={note.id} entering={FadeInDown.springify().damping(18).stiffness(220)} exiting={FadeOutDown.duration(160)} layout={layout} className="absolute left-1 right-1 bottom-2" pointerEvents="box-none">
      <Pressable onPress={onDone} accessibilityRole="summary" accessibilityLiveRegion="polite" className="bg-ink rounded-card px-3.5 py-3 gap-2" style={{ shadowColor: '#161F2A', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}>
        <View className="flex-row items-center gap-2.5 min-h-9">
          <Icon name={note.kind === 'undone' ? 'undo' : note.kind === 'failed' ? 'wifiOff' : 'trash'} size={18} color="#FFFFFF" strokeWidth={2} />
          <Text bold tone="inverse" numberOfLines={1} className="flex-1">
            {title}
          </Text>
          {note.kind === 'skipped' && left > 0 ? (
            <AView exiting={FadeOut.duration(150)} className="flex-row items-center gap-2">
              <View className="w-4 items-center" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <AView key={left} entering={ZoomIn.duration(180)}>
                  <Text variant="sm" bold tone="inverse" style={{ opacity: 0.7 }}>
                    {String(left)}
                  </Text>
                </AView>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t('skip.undoLabel', { n: left })} onPress={onUndo} hitSlop={10} className="bg-white rounded-[10px] px-3 min-h-9 justify-center active:opacity-80">
                <Text variant="sm" bold tone="onWhite">
                  {t('skip.undo')}
                </Text>
              </Pressable>
            </AView>
          ) : null}
        </View>
        {note.changes.map((c) => (
          <AView key={c.text} entering={FadeIn.duration(200)} layout={layout} className="flex-row items-start gap-2.5">
            <View className="pt-0.5">
              <Icon name={c.icon} size={16} color={c.warn ? '#FF8A8E' : '#FFC21A'} strokeWidth={2} />
            </View>
            <Text variant="sm" tone="inverse" className="flex-1" style={c.warn ? { color: '#FF8A8E' } : { opacity: 0.92 }}>
              {c.text}
            </Text>
          </AView>
        ))}
      </Pressable>
    </AView>
  );
});
