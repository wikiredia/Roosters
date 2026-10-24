import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useBlock, useReport, useTakeBack } from '@/api/hooks';
import type { ChatDetail, ChatMessage, ReportReason } from '@/api/types';
import { Check, Option } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Inputs';
import { Card, Row } from '@/components/ui/Layout';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { confirm } from '@/lib/confirm';

const REASONS: ReportReason[] = ['mean', 'unsafe', 'spam', 'other'];

/**
 * Long press on a message: copy it; theirs: report it ("Meld dit bericht": why, an optional note, and blocking the
 * writer too if you want) or block the writer; yours: take it back for everyone. Whoever you report or block never
 * sees it (the sheet says so: required by the App Store and Play for chat).
 */
export function MessageSheet({ message, chat, myId, onClose }: { message: ChatMessage | null; chat: ChatDetail; myId: number | undefined; onClose: () => void }) {
  const { t } = useT();
  // Keep showing the last message while the sheet slides away
  const [last, setLast] = useState(message);
  if (message && message !== last) setLast(message);
  const m = message ?? last;
  const [step, setStep] = useState<'menu' | 'report' | 'done'>('menu');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const report = useReport();
  const block = useBlock();
  const takeBack = useTakeBack(chat.id);
  const author = chat.people.find((p) => p.id === m?.user_id);
  const name = author?.display_name ?? '';
  const mine = m?.user_id === myId;

  function close() {
    onClose();
    // Start over next time (after the slide)
    setTimeout(() => {
      setStep('menu');
      setReason(null);
      setNote('');
      setAlsoBlock(false);
      report.reset();
    }, 250);
  }

  async function copy() {
    if (m?.body) await Clipboard.setStringAsync(m.body);
    close();
  }

  async function onBlock() {
    if (!author) return;
    if (!(await confirm(t('friend.blockConfirm', { name }), t('chat.blockSub', { name }), t('friend.block', { name }), t('common.cancel')))) return;
    await block.mutateAsync(author.id);
    close();
    // A one-to-one chat ends with the friendship
    if (chat.kind === 'direct') router.back();
  }

  async function onTakeBack() {
    if (!m || !(await confirm(t('chat.takeBackConfirm'), t('chat.takeBackSub'), t('chat.takeBack'), t('common.cancel')))) return;
    await takeBack.mutateAsync(m.id);
    close();
  }

  async function sendReport() {
    if (!m || !reason) return;
    const r = await report.mutateAsync({ messageId: m.id, reason, note: note.trim() || null, block: alsoBlock });
    setStep('done');
    if (r.blocked && chat.kind === 'direct') {
      close();
      router.back();
    }
  }

  return (
    <Sheet
      visible={!!message}
      onClose={close}
      closeLabel={t('common.close')}
      title={step === 'report' ? t('chat.reportTitle') : step === 'done' ? t('chat.reportedTitle') : undefined}
      sub={step === 'report' ? t('chat.reportSub', { name }) : undefined}
    >
      {m && step === 'menu' ? (
        <>
          <Card className="p-3">
            <Text variant="sm" bold tone="ink2">
              {mine ? t('chat.you') : name}
            </Text>
            <Text numberOfLines={4}>{m.body}</Text>
          </Card>
          <Card>
            <MenuRow first icon="copy" label={t('chat.copy')} onPress={copy} />
            {mine ? (
              <MenuRow icon="trash" label={t('chat.takeBack')} danger onPress={onTakeBack} />
            ) : (
              <>
                <MenuRow icon="flag" label={t('chat.report')} onPress={() => setStep('report')} />
                {author ? <MenuRow icon="block" label={t('friend.block', { name })} danger onPress={onBlock} /> : null}
              </>
            )}
          </Card>
          {!mine ? (
            <Text variant="sm" tone="ink2">
              {t('chat.theyDontSee', { name })}
            </Text>
          ) : null}
        </>
      ) : null}
      {m && step === 'report' ? (
        <>
          <View className="gap-2">
            {REASONS.map((r) => (
              <Option key={r} label={t(`chat.reason.${r}`)} on={reason === r} onPress={() => setReason(r)} />
            ))}
          </View>
          <Input label={t('chat.reportNote')} value={note} onChangeText={setNote} maxLength={300} multiline />
          <Row
            first
            className="px-0"
            title={t('chat.alsoBlock', { name })}
            sub={t('chat.alsoBlockSub')}
            left={<Check on={alsoBlock} />}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: alsoBlock }}
            onPress={() => setAlsoBlock(!alsoBlock)}
          />
          {report.error ? (
            <Text variant="sm" bold tone="danger">
              {report.error.message}
            </Text>
          ) : null}
          <Button icon="flag" label={t('chat.sendReport')} disabled={!reason || report.isPending} loading={report.isPending} onPress={sendReport} />
          <Text variant="sm" tone="ink2">
            {t('chat.theyDontSee', { name })}
          </Text>
        </>
      ) : null}
      {step === 'done' ? (
        <>
          <Text tone="ink2">{t('chat.reportedBody')}</Text>
          <Button variant="secondary" label={t('common.close')} onPress={close} />
        </>
      ) : null}
    </Sheet>
  );
}

function MenuRow({ icon, label, onPress, danger, first }: { icon: IconName; label: string; onPress: () => void; danger?: boolean; first?: boolean }) {
  return (
    <Row first={first} title={label} tone={danger ? 'danger' : 'ink'} onPress={onPress} right={<Icon name={icon} size={20} color={danger ? 'danger-ink' : 'ink-2'} />} />
  );
}
