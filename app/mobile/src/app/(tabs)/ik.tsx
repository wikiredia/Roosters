import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, Share, View } from 'react-native';

import { exportData, signOut, useCampuses, useFriends, useGhost, useMe, useSchools, useSources } from '@/api/hooks';
import type { User } from '@/api/types';
import { Avatar, IconTile, Option, Tag } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Card, ListHead, Row } from '@/components/ui/Layout';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { langPref, useT } from '@/i18n';
import { confirm } from '@/lib/confirm';
import { debugEnabled } from '@/lib/server';
import { hhmm, minutesAgo, nowMin } from '@/lib/time';

const LEGAL_URL = process.env.EXPO_PUBLIC_LEGAL_URL ?? 'https://github.com/wikiredia/Roosters';

type T = ReturnType<typeof useT>['t'];

/** Ghost mode is on until this moment (null = off). */
function ghostUntil(u: User | undefined): Date | null {
  if (!u?.ghost_until) return null;
  const d = new Date(u.ghost_until.endsWith('Z') ? u.ghost_until : `${u.ghost_until}Z`);
  return d.getTime() > Date.now() ? d : null;
}

export default function IkScreen() {
  const { t, lang } = useT();
  const me = useMe();
  const user = me.data;
  const schools = useSchools();
  const campuses = useCampuses(user?.school_id ?? null);
  const friends = useFriends();
  const sources = useSources();
  const pref = langPref.use();
  const [ghostOpen, setGhostOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const school = schools.data?.find((s) => s.id === user?.school_id);
  const campus = campuses.data?.find((c) => c.id === user?.campus_id);
  const ghost = ghostUntil(user);
  const untis = (sources.data ?? []).filter((s) => s.kind === 'untis').length;
  const links = (sources.data ?? []).filter((s) => s.kind === 'ics').length;
  const oldest = (sources.data ?? []).map((s) => s.last_ok).filter(Boolean).sort()[0];
  const ago = minutesAgo(oldest);

  async function download() {
    setBusy('export');
    try {
      const data = JSON.stringify(await exportData(), null, 2);
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        a.download = 'roostersplus-data.json';
        a.click();
      } else {
        await Share.share({ title: 'roostersplus-data.json', message: data });
      }
    } catch {
      Alert.alert(t('common.offline'));
    } finally {
      setBusy(null);
    }
  }

  async function logout(everywhere: boolean) {
    // A guest has no way back in: signing out deletes nothing but loses the account on this phone
    if (user?.guest && !(await confirm(t('me.guestLogout'), t('me.guestLogoutSub'), t('me.logout'), t('common.cancel')))) return;
    setBusy(everywhere ? 'all' : 'one');
    try {
      await signOut(everywhere);
    } catch {
      Alert.alert(t('common.offline'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title={t('tabs.me')}>
      <View className="flex-row items-center gap-4">
        <Avatar name={user?.display_name ?? '?'} color={user?.avatar_color ?? 0} size="xl" />
        <View className="flex-1 gap-0.5">
          <Text variant="sheet">{user?.display_name ?? ''}</Text>
          <Text variant="sm" tone="ink2">
            {[school?.short_name ?? school?.name, campus?.name].filter(Boolean).join(' · ')}
          </Text>
          <Text variant="sm" bold tone="you" accessibilityRole="link" onPress={() => router.push('/settings/profile')} className="pt-1">
            {t('me.editProfile')}
          </Text>
        </View>
      </View>

      <Card>
        <Row
          first
          left={<IconTile name="crown" tone="premium-ink" />}
          title={t('me.premium')}
          sub={t('me.premiumSub')}
          right={<Tag kind="premium">{t('common.soon')}</Tag>}
        />
        <Row
          left={<IconTile name="ghost" />}
          title={t('me.ghost')}
          sub={ghost ? t('me.ghostOnUntil', { t: ghostLabel(ghost, t) }) : t('me.ghostSub')}
          right={<Tag kind={ghost ? 'ink' : 'neutral'}>{ghost ? t('common.on') : t('common.off')}</Tag>}
          onPress={() => setGhostOpen(true)}
        />
      </Card>

      <View>
        <ListHead>{t('me.friendsHead')}</ListHead>
        <Card>
          <Row first left={<IconTile name="users" />} title={t('me.friends')} right={<Text tone="ink2">{String(friends.data?.length ?? '')}</Text>} chevron onPress={() => router.push('/friends')} />
          <Row left={<IconTile name="plus" />} title={t('me.addFriend')} sub={t('me.addFriendSub')} chevron onPress={() => router.push('/friends/add')} />
        </Card>
      </View>

      <View>
        <ListHead>{t('me.scheduleHead')}</ListHead>
        <Card>
          <Row
            first
            left={<IconTile name="calendar" />}
            title={t('me.sources')}
            sub={[t('me.classes', { n: untis }), links ? t('me.links', { n: links }) : null, ago != null ? t('me.updated', { ago: agoLabel(ago, t) }) : null].filter(Boolean).join(' · ')}
            chevron
            onPress={() => router.push('/settings/sources')}
          />
          <Row left={<IconTile name="bell" />} title={t('me.notifications')} sub={t('me.notificationsSub')} right={<Tag>{t('common.soon')}</Tag>} />
          <Row
            left={<IconTile name="globe" />}
            title={t('me.language')}
            right={<Text tone="ink2">{pref === 'system' ? t('lang.system') : lang === 'nl' ? 'Nederlands' : 'English'}</Text>}
            chevron
            onPress={() => router.push('/settings/language')}
          />
        </Card>
      </View>

      <View>
        <ListHead>{t('me.accountHead')}</ListHead>
        <Card>
          {user?.guest ? (
            <Row first left={<IconTile name="mail" tone="you-ink" />} title={t('steps.email')} sub={t('me.guestSub')} tone="you" chevron onPress={() => router.push({ pathname: '/login/email', params: { from: 'steps' } })} />
          ) : null}
          <Row first={!user?.guest} left={<IconTile name="shield" />} title={t('me.privacy')} sub={t('me.privacySub')} chevron onPress={() => Linking.openURL(LEGAL_URL)} />
          <Row left={<IconTile name="download" />} title={t('me.download')} right={busy === 'export' ? <Text tone="ink2">…</Text> : undefined} onPress={download} />
          {/* One row; the sheet asks: this phone, or every device */}
          <Row left={<IconTile name="logout" />} title={t('me.logout')} chevron onPress={() => (user?.guest ? logout(false) : setLogoutOpen(true))} disabled={!!busy} />
          <Row left={<IconTile name="trash" tone="danger-ink" />} title={t('me.delete')} tone="danger" chevron onPress={() => router.push('/settings/delete')} />
        </Card>
      </View>

      {debugEnabled ? (
        <Card>
          <Row first left={<IconTile name="wifi" />} title="Server & debug" sub="Development builds only" chevron onPress={() => router.push('/debug')} />
          <Row left={<IconTile name="users" />} title="Test data & users" sub="Test friends, switch account" chevron onPress={() => router.push('/dev')} />
        </Card>
      ) : null}

      <Text variant="xs" tone="ink3" className="text-center">
        Roosters+ v1.0 ·{' '}
        <Text variant="xs" tone="ink3" className="underline" onPress={() => Linking.openURL(LEGAL_URL)}>
          {t('me.terms')}
        </Text>
      </Text>

      <GhostSheet visible={ghostOpen} onClose={() => setGhostOpen(false)} on={!!ghost} />
      <Sheet visible={logoutOpen} onClose={() => setLogoutOpen(false)} closeLabel={t('common.close')} title={t('me.logout')} sub={t('me.logoutSheetSub')}>
        <Button variant="danger" icon="logout" label={t('me.logoutHere')} loading={busy === 'one'} disabled={!!busy} onPress={() => logout(false)} />
        <Button variant="danger" icon="logout" label={t('me.logoutAll')} loading={busy === 'all'} disabled={!!busy} onPress={() => logout(true)} />
        <Text variant="sm" tone="ink2" className="text-center">
          {t('me.logoutAllSub')}
        </Text>
      </Sheet>
    </Screen>
  );
}

function agoLabel(min: number, t: T) {
  if (min < 1) return t('time.justNow');
  if (min < 120) return t('time.minAgo', { n: min });
  if (min < 48 * 60) return t('time.hoursAgo', { n: Math.round(min / 60) });
  return t('time.daysAgo', { n: Math.round(min / 1440) });
}

function ghostLabel(d: Date, t: T) {
  if (d.getFullYear() > 9000) return t('ghost.untilOffShort');
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? hhmm(d.getHours() * 60 + d.getMinutes()) : t('ghost.midnight');
}

type Choice = 'hour' | 'today' | 'forever';

function GhostSheet({ visible, onClose, on }: { visible: boolean; onClose: () => void; on: boolean }) {
  const { t } = useT();
  const ghost = useGhost();
  const [choice, setChoice] = useState<Choice>('hour');
  const now = nowMin();
  const minutes = { hour: 60, today: 24 * 60 - now, forever: -1 }[choice];

  async function apply(m: number) {
    await ghost.mutateAsync(m);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t('common.close')} title={t('me.ghost')} sub={t('ghost.body')}>
      {on ? (
        <Button label={t('ghost.turnOff')} loading={ghost.isPending} onPress={() => apply(0)} />
      ) : (
        <>
          <Text bold>{t('ghost.hideUntil')}</Text>
          <View accessibilityRole="radiogroup" className="gap-2">
            <Option label={t('ghost.hour')} sub={t('ghost.untilTime', { t: hhmm((now + 60) % (24 * 60)) })} on={choice === 'hour'} onPress={() => setChoice('hour')} />
            <Option label={t('ghost.today')} sub={t('ghost.midnight')} on={choice === 'today'} onPress={() => setChoice('today')} />
            <Option label={t('ghost.untilOff')} on={choice === 'forever'} onPress={() => setChoice('forever')} />
          </View>
          <Button icon="ghost" variant="ink" label={t('ghost.hide')} loading={ghost.isPending} onPress={() => apply(minutes)} />
        </>
      )}
    </Sheet>
  );
}
