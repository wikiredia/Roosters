import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { useMe, useSources } from '@/api/hooks';
import { Mascot } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { useDebug } from '@/lib/server';
import { clearSession, session } from '@/lib/session';

/** Where to start: welcome, the first unfinished onboarding step (until it's finished or skipped), or Rooster. */
export default function Gate() {
  const debug = useDebug();
  const s = session.use();
  const signedIn = s.status === 'signedIn';
  const me = useMe(signedIn);
  const sources = useSources();
  const { t } = useT();

  if (s.status === 'loading') return null;
  if (!signedIn) return <Redirect href="/welcome" />;
  if (me.data) {
    // Done or skipped: always straight in. What's missing shows on Today ("Complete the following steps").
    if (me.data.onboarded) return <Redirect href="/rooster" />;
    // Name and photo first (skippable), then the school
    if (!me.data.school_id) return <Redirect href="/onboarding/profile" />;
    if (sources.data && sources.data.length === 0) return <Redirect href="/onboarding/classes" />;
    if (sources.data) return <Redirect href="/onboarding/courses" />;
  }
  // Very first start after signing in (nothing cached yet): one calm screen, no spinner
  return (
    <View className="flex-1 bg-bg items-center justify-center gap-4 px-8">
      <Mascot size={96} />
      <Text tone="ink2" className="text-center">
        {me.isError ? t('gate.offline') : t('gate.loading')}
      </Text>
      {me.isError ? (
        // Stuck without a connection: a way out (wrong server address, or start over)
        <View className="flex-row gap-2">
          {debug ? <Button variant="secondary" size="sm" icon="wifi" label="Server & debug" onPress={() => router.push('/debug')} /> : null}
          <Button variant="ghost" size="sm" label={t('gate.signOut')} onPress={() => clearSession()} />
        </View>
      ) : null}
    </View>
  );
}
