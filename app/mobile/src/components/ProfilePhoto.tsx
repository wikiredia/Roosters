import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useSetPhoto } from '@/api/hooks';
import type { User } from '@/api/types';
import { Avatar } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { pickPhoto } from '@/lib/photo';

/**
 * Your photo, big, with "Kies foto" / "Maak foto" (no camera on the web) and "Verwijder" once there is one.
 * A picked photo is cropped square, shrunk (lib/photo.ts) and saved right away; it shows while it uploads.
 * Onboarding's profile step and Profiel bewerken.
 */
export function ProfilePhoto({ me, name, color }: { me: User | undefined; name: string; color: number }) {
  const { t } = useT();
  const set = useSetPhoto();
  const [local, setLocal] = useState<string | null>(null);

  async function choose(from: 'library' | 'camera') {
    const jpeg = await pickPhoto(from);
    if (!jpeg) return;
    setLocal(`data:image/jpeg;base64,${jpeg}`);
    try {
      await set.mutateAsync(jpeg);
    } catch {
      setLocal(null);
    }
  }

  const has = !!local || !!me?.photo;
  return (
    <View className="items-center gap-3">
      <Pressable accessibilityRole="button" accessibilityLabel={t('photo.choose')} onPress={() => choose('library')} className="active:opacity-80">
        <Avatar name={name || '?'} color={color} size="xl" uid={me?.id} photo={me?.photo} uri={local ?? undefined} />
        <View className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-ink items-center justify-center border-2 border-bg">
          <Icon name="camera" size={16} color="ink-inverse" strokeWidth={2} />
        </View>
      </Pressable>
      <View className="flex-row flex-wrap justify-center gap-2">
        <Button variant="secondary" size="sm" icon="user" label={t('photo.choose')} loading={set.isPending} onPress={() => choose('library')} />
        {Platform.OS !== 'web' ? <Button variant="secondary" size="sm" icon="camera" label={t('photo.take')} disabled={set.isPending} onPress={() => choose('camera')} /> : null}
        {has ? (
          <Button
            variant="ghost"
            size="sm"
            label={t('photo.remove')}
            disabled={set.isPending}
            onPress={() => {
              setLocal(null);
              set.mutate(null);
            }}
          />
        ) : null}
      </View>
      {set.isError ? (
        <Text variant="sm" bold tone="danger">
          {set.error.message}
        </Text>
      ) : null}
    </View>
  );
}
