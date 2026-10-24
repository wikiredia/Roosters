import { router } from 'expo-router';

import { useMe } from '@/api/hooks';
import type { Today } from '@/api/types';
import { useT, type Key } from '@/i18n';
import { pushState } from '@/lib/push';

import { IconTile } from './ui/Bits';
import type { IconName } from './ui/Icon';
import { Card, Row, SectionHead } from './ui/Layout';
import { Reveal } from './ui/Motion';

type Step = { key: string; title: Key; sub: Key; icon: IconName; go: () => void };

/**
 * Today: "Complete the following steps", for everything skipped in onboarding (lib/onboarding.ts).
 * Each step disappears once it's done; the card disappears with the last one. Notifications go by what the phone
 * says (`lib/push.pushState`), not by a flag: allowing them anywhere (or in the phone's settings) ticks it off.
 */
export function SetupSteps({ d }: { d: Today }) {
  const { t } = useT();
  const me = useMe().data;
  const push = pushState.use();
  if (!me) return null;
  const steps: Step[] = [];
  if (me.guest) {
    steps.push({ key: 'email', title: 'steps.email', sub: 'steps.emailSub', icon: 'mail', go: () => router.push({ pathname: '/login/email', params: { from: 'steps' } }) });
  }
  if (!me.school_id && d.sources.count === 0) {
    steps.push({ key: 'school', title: 'steps.school', sub: 'steps.schoolSub', icon: 'pin', go: () => router.push({ pathname: '/onboarding/school', params: { from: 'settings' } }) });
  }
  if (d.sources.count === 0) {
    steps.push({
      key: 'timetable',
      title: 'steps.timetable',
      sub: me.school_id ? 'steps.timetableSub' : 'steps.timetableLinkSub',
      icon: 'calendar',
      go: () => (me.school_id ? router.push({ pathname: '/onboarding/classes', params: { from: 'settings' } }) : router.push({ pathname: '/settings/sources', params: { add: 'link' } })),
    });
  }
  if (!me.guest && d.friends.length === 0) {
    steps.push({ key: 'friends', title: 'steps.friends', sub: 'steps.friendsSub', icon: 'users', go: () => router.push('/friends/add') });
  }
  // Not asked yet on this phone. Allowed, or a no from the phone (Meldingen says how to turn it on): done.
  // Can't get push here (web, Expo Go on Android, no EAS project): not a step.
  if (push === 'undetermined') {
    steps.push({ key: 'push', title: 'steps.push', sub: 'steps.pushSub', icon: 'bell', go: () => router.push({ pathname: '/onboarding/notifications', params: { from: 'settings' } }) });
  }
  if (steps.length === 0) return null;
  return (
    <Reveal className="gap-3">
      <SectionHead title={t('steps.title')} aside={String(steps.length)} />
      <Card>
        {steps.map((s, i) => (
          <Row key={s.key} first={i === 0} left={<IconTile name={s.icon} tone="you-ink" />} title={t(s.title)} sub={t(s.sub)} chevron onPress={s.go} accessibilityRole="button" />
        ))}
      </Card>
    </Reveal>
  );
}
