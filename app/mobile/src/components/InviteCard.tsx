import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { useInvite } from '@/api/hooks';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Layout';
import { Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';

/**
 * "Jouw link" and "Jouw vriendencode", each with Kopieer and Deel side by side (the phone's share sheet:
 * WhatsApp, Instagram, Snapchat, ... are all in there). The code is for typing over or saying out loud; the
 * QR code of the link is in QrCard.
 */
export function InviteCard() {
  const { t } = useT();
  const invite = useInvite();
  const url = invite.data?.url;
  const code = invite.data?.code;
  return (
    <Card className="p-4 gap-4">
      <Part
        label={t('invite.yourLink')}
        value={url?.replace(/^https?:\/\//, '')}
        copyValue={url}
        shareMessage={url ? t('invite.message', { url }) : undefined}
        shareLabel={t('invite.shareLink')}
      />
      <View className="h-px bg-line" />
      <Part label={t('invite.yourCode')} value={code} big copyValue={code} shareMessage={code ? t('invite.codeMessage', { code }) : undefined} shareLabel={t('invite.shareCode')} />
    </Card>
  );
}

/** One of the two: what it is, the value, and Kopieer | Deel (half the width each). */
function Part({ label, value, big, copyValue, shareMessage, shareLabel }: { label: string; value?: string; big?: boolean; copyValue?: string; shareMessage?: string; shareLabel: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!copyValue) return;
    await Clipboard.setStringAsync(copyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View className="gap-2.5">
      <View>
        <Text variant="xs" bold tone="ink2">
          {label}
        </Text>
        {value ? (
          <Text bold selectable numberOfLines={1} variant={big ? 'sheet' : 'base'} style={big ? { letterSpacing: 3 } : undefined}>
            {value}
          </Text>
        ) : (
          <Skeleton width={180} className="mt-1" />
        )}
      </View>
      <View className="flex-row gap-2">
        <Button
          variant="secondary"
          icon={copied ? 'check' : 'copy'}
          label={copied ? t('invite.copied') : t('invite.copy')}
          accessibilityLabel={`${copied ? t('invite.copied') : t('invite.copy')}: ${label}`}
          onPress={copy}
          disabled={!copyValue}
          className="flex-1"
        />
        <Button icon="share" label={t('invite.shareShort')} accessibilityLabel={shareLabel} disabled={!shareMessage} onPress={() => shareMessage && Share.share({ message: shareMessage })} className="flex-1" />
      </View>
    </View>
  );
}
