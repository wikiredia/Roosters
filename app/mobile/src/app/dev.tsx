import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import type { Visibility } from '@/api/types';
import { Avatar, Banner, Tag } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Card, ListHead, Row } from '@/components/ui/Layout';
import { Screen, Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { api, ApiError, NetworkError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { queryClient } from '@/lib/query';
import { useDebug } from '@/lib/server';
import { saveTokens, type Tokens } from '@/lib/session';

/**
 * Test data & users: like Server & debug, in development builds or for the owner's account in any build (lib/server
 * useDebug), against an API with ENV=dev or signed in as the owner (any server). Make test
 * friends with a made-up timetable, switch to one of them in one tap to see what a friend sees (and back to your own
 * account), befriend or unfriend, remove them again. Only your own account and the test people it made: never another
 * real account. Developer-facing, so English and not translated.
 */

type DevUser = {
  id: number;
  display_name: string;
  email: string | null;
  guest: boolean;
  test: boolean;
  avatar_color: number;
  school: string | null;
  onboarded: boolean;
  friends: number;
  friend: boolean;
  my_visibility: Visibility | null;
  their_visibility: Visibility | null;
};

const VIS: Record<Visibility, string> = { full: 'everything', norooms: 'no rooms', freebusy: 'free/busy' };

function errorText(e: unknown) {
  if (e instanceof ApiError && e.status === 404) return 'The API answered 404: it runs without ENV=dev and you are not the owner\'s account, it is an older version, or that account is not yours.';
  if (e instanceof ApiError) return `${e.status} ${e.code}: ${e.message}`;
  if (e instanceof NetworkError) return `No answer from the API (${e.kind}).`;
  return e instanceof Error ? e.message : String(e);
}

export default function DevScreen() {
  const debug = useDebug();
  const users = useQuery({
    queryKey: ['debug-users'],
    queryFn: () => api.get<{ me: number; owner: number; users: DevUser[] }>('/api/v1/debug/users', { etag: false }),
    enabled: debug,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (!debug) return null;
  const list = users.data?.users ?? [];
  const me = list.find((u) => u.id === users.data?.me);
  const tests = list.filter((u) => u.test);

  /** Runs one action, shows what happened, and refreshes the list (and everything else: friends changed). */
  async function run(key: string, action: () => Promise<string>) {
    setBusy(key);
    setResult(null);
    try {
      setResult({ ok: true, text: await action() });
      await queryClient.invalidateQueries();
    } catch (e) {
      setResult({ ok: false, text: errorText(e) });
    } finally {
      setBusy(null);
    }
  }

  /** A new session for that account: the whole app now runs as them (the cache of the previous one is dropped). */
  async function switchTo(u: DevUser) {
    setBusy(`switch-${u.id}`);
    try {
      // Signed in like a real login: this session ends, the account gets a new one for this device
      const t = await api.post<Tokens>('/api/v1/debug/login', { user_id: u.id, platform: Platform.OS, device_name: 'Test data & users' });
      queryClient.clear();
      await saveTokens(t);
      router.replace('/');
    } catch (e) {
      setResult({ ok: false, text: errorText(e) });
      setBusy(null);
    }
  }

  const addFriends = (count: number, befriend = true) =>
    run(`add-${count}-${befriend}`, async () => {
      const r = await api.post<{ created: number[] }>('/api/v1/debug/test-users', { count, befriend });
      return `Added ${r.created.length} test ${r.created.length === 1 ? 'person' : 'people'}${befriend ? ', friends with you' : ''}, each with a test timetable.`;
    });

  return (
    <Screen back navTitle="Test data & users" noBanner onRefresh={() => users.refetch()}>
      <Text variant="sm" tone="ink2">
        Test people get a made-up timetable (last week to three weeks ahead) at your school and campus. Tap one to continue as them: change what a
        friend sees on their page (Me → Friends), switch, and look at yourself from their side. Only your own account and your test people are
        listed; with ENV=dev, or on any server for the owner&apos;s account.
      </Text>

      {result ? <Banner kind={result.ok ? 'neutral' : 'bad'} title={result.ok ? 'Done' : "That didn't work"} body={result.text} /> : null}
      {users.error ? <Banner kind="bad" title="Couldn't load the accounts" body={errorText(users.error)} /> : null}

      <View>
        <ListHead>You</ListHead>
        <Card>
          {me ? (
            <Row
              first
              left={<Avatar name={me.display_name} color={me.avatar_color} />}
              title={`${me.display_name} · #${me.id}`}
              sub={[me.email ?? (me.guest ? 'guest' : 'no e-mail'), me.school ?? 'no school', `${me.friends} friends`].join(' · ')}
            />
          ) : (
            <Row first title={users.isLoading ? 'Loading…' : 'Not signed in'} />
          )}
        </Card>
        {me ? (
          <Button
            variant="secondary"
            size="sm"
            icon="calendar"
            label="Give me a test timetable"
            className="self-start mt-2"
            loading={busy === 'mine'}
            onPress={() =>
              run('mine', async () => {
                const r = await api.post<{ lessons: number }>(`/api/v1/debug/users/${me.id}/timetable`);
                return `Your account follows 'Testrooster' now (${r.lessons} lessons). Remove it under Me → Timetable sources.`;
              })
            }
          />
        ) : null}
      </View>

      <View>
        <ListHead>Test data</ListHead>
        <Card className="p-4 gap-3">
          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" icon="plus" label="1 test friend" loading={busy === 'add-1-true'} disabled={!me || !!busy} onPress={() => addFriends(1)} />
            <Button size="sm" icon="plus" label="3 test friends" loading={busy === 'add-3-true'} disabled={!me || !!busy} onPress={() => addFriends(3)} />
            <Button size="sm" variant="secondary" icon="plus" label="1 stranger" loading={busy === 'add-1-false'} disabled={!me || !!busy} onPress={() => addFriends(1, false)} />
          </View>
          <Button
            size="sm"
            variant="secondary"
            icon="chat"
            label="Test chats with my test friends"
            className="self-start"
            loading={busy === 'chats'}
            disabled={!me || !!busy}
            onPress={() =>
              run('chats', async () => {
                await api.post('/api/v1/debug/test-chats');
                return "A group 'De bende' with your test friends and a one-to-one chat, with a few of their messages (Chat tab).";
              })
            }
          />
          <Button
            variant="danger"
            size="sm"
            icon="trash"
            label={`Remove all test people (${tests.length})`}
            disabled={!tests.length || !!busy}
            loading={busy === 'clear'}
            onPress={async () => {
              if (!(await confirm('Remove all test people?', 'Their accounts, timetables, friendships and break requests go too.', 'Remove', 'Cancel'))) return;
              run('clear', async () => `Removed ${(await api.del<{ removed: number }>('/api/v1/debug/test-users')).removed} test people.`);
            }}
          />
        </Card>
      </View>

      <View>
        <ListHead>{`Switch user (${list.length})`}</ListHead>
        <Card>
          {users.isLoading ? (
            <View className="p-4 gap-2">
              <Skeleton width={180} />
              <Skeleton width={120} />
            </View>
          ) : (
            list.map((u, i) => {
              const self = u.id === users.data?.me;
              return (
                <Row
                  key={u.id}
                  first={i === 0}
                  left={<Avatar name={u.display_name} color={u.avatar_color} />}
                  title={`${u.display_name}${self ? ' (you)' : ''}`}
                  sub={
                    <View className="gap-1">
                      <Text variant="sm" tone="ink2" numberOfLines={1}>
                        {[`#${u.id}`, u.email ?? (u.guest ? 'guest' : 'no e-mail'), u.school].filter(Boolean).join(' · ')}
                      </Text>
                      <View className="flex-row flex-wrap gap-1.5">
                        {u.id === users.data?.owner ? <Tag kind="ok">your account</Tag> : null}
                        {u.test ? <Tag kind="you">test</Tag> : null}
                        {u.guest ? <Tag>guest</Tag> : null}
                        {!u.onboarded ? <Tag>not onboarded</Tag> : null}
                        {u.friend && u.my_visibility ? <Tag kind="friend">{`sees ${VIS[u.my_visibility]}`}</Tag> : null}
                        {u.friend && u.their_visibility ? <Tag kind="ok">{`shows ${VIS[u.their_visibility]}`}</Tag> : null}
                      </View>
                    </View>
                  }
                  accessibilityHint="Continue as this account"
                  disabled={self || !!busy}
                  onPress={self ? undefined : () => switchTo(u)}
                  right={
                    !self && me ? (
                      <View className="items-end gap-1.5">
                        <Button
                          size="sm"
                          variant={u.friend ? 'secondary' : 'tonal'}
                          label={u.friend ? 'Unfriend' : 'Befriend'}
                          disabled={!!busy}
                          onPress={() =>
                            run(`friend-${u.id}`, async () => {
                              await api.put(`/api/v1/debug/friends/${u.id}`, { friends: !u.friend });
                              return u.friend ? `You and ${u.display_name} aren't friends any more.` : `You and ${u.display_name} are friends now.`;
                            })
                          }
                        />
                        {u.test ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            label="Remove"
                            disabled={!!busy}
                            onPress={() =>
                              run(`del-${u.id}`, async () => {
                                await api.del(`/api/v1/debug/users/${u.id}`);
                                return `Removed ${u.display_name}.`;
                              })
                            }
                          />
                        ) : null}
                      </View>
                    ) : busy === `switch-${u.id}` ? (
                      <Text tone="ink2">…</Text>
                    ) : null
                  }
                />
              );
            })
          )}
        </Card>
      </View>
    </Screen>
  );
}
