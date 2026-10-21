import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { useInvite } from '@/api/hooks';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Layout';
import { Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';

/** "Jouw link" with copy and the phone's share sheet (WhatsApp, Instagram, Snapchat, ... are all in there). */
export function InviteCard() {
  const { t } = useT();
  const invite = useInvite();
  const [copied, setCopied] = useState(false);
  const url = invite.data?.url;

  async function copy() {
    if (!url) return;
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="p-4 gap-3.5">
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Text variant="xs" bold tone="ink2">
            {t('invite.yourLink')}
          </Text>
          {url ? (
            <Text bold selectable numberOfLines={1}>
              {url.replace(/^https?:\/\//, '')}
            </Text>
          ) : (
            <Skeleton width={180} className="mt-1" />
          )}
        </View>
        <Button variant="secondary" size="sm" icon={copied ? 'check' : 'copy'} label={copied ? t('invite.copied') : t('invite.copy')} onPress={copy} disabled={!url} />
      </View>
      <Button
        icon="share"
        label={t('invite.share')}
        disabled={!url}
        onPress={() => url && Share.share({ message: t('invite.message', { url }) })}
      />
      {invite.data ? (
        <Text variant="xs" tone="ink3">
          {t('invite.code', { code: invite.data.code })}
        </Text>
      ) : null}
    </Card>
  );
}
