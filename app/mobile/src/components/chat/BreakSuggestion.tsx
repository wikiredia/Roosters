import { View } from 'react-native';

import type { SharedBreak } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { dayWord } from '@/lib/breaks';
import { isoDay, range } from '@/lib/time';

/**
 * "Morgen 12:30–13:20 zijn jullie allebei vrij · Pauze samen?": a break you share with the friend of a one-to-one
 * chat that nobody asked for yet, as the newest row of the conversation (right above the box, it scrolls with the
 * messages). Full width like a request card, but lighter: yellow edge, one line of text and the button. `onAsk`
 * opens BreakSheet for it.
 */
export function BreakSuggestion({ b, onAsk }: { b: SharedBreak; onAsk: () => void }) {
  const { t, lang } = useT();
  const when = `${dayWord(b.day, isoDay(new Date()), t, lang)} ${range(b.start, b.end)}`;
  return (
    <View className="self-stretch flex-row items-center gap-2.5 rounded-card border-[1.5px] border-together bg-together-soft pl-3.5 pr-2 py-2">
      <Icon name="coffee" size={18} color="together-ink" strokeWidth={2} />
      <Text variant="sm" className="flex-1 min-w-0">
        {t('chat.bothFree', { when })}
      </Text>
      <Button variant="together" size="sm" label={t('chat.breakTogether')} onPress={onAsk} />
    </View>
  );
}
