import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';

import { lang, translate } from '@/i18n';

import { api } from './api';
import { queryClient } from './query';
import { prefs } from './storage';
import { createStore } from './store';

/**
 * Push notifications on this phone (the server side is api/roosters/push.py).
 *
 * - `registerPush` asks the phone (only when you tap "Zet meldingen aan"), gets the Expo push token and gives it to
 *   the server, which ties it to this session: signing out stops push here. Called at every start once signed in.
 * - The Android channels are the categories of Meldingen (requests, changes, chat); the server picks one per push.
 * - A break request comes with Ja / Nee / Ander uur (category `break_request`).
 * - `handlePushResponses` (in the tabs layout): a tap opens what the push is about (`data.url`); Ja / Nee answers.
 *
 * Remote push needs a development build (not Expo Go on Android) and an EAS project id (`npx eas-cli init` writes
 * `extra.eas.projectId` into app.json). Without one, `pushState` says why.
 */
export type PushState = 'unknown' | 'unsupported' | 'undetermined' | 'denied' | 'granted' | 'noProject' | 'failed';

export const pushState = createStore<PushState>('unknown');

export type PushData = { kind?: string; url?: string; chat?: number; request?: number; day?: string };

const SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

/** The chat on screen now: its messages don't come in as a banner, you're reading them already. */
let openChat = 0;
export function setOpenChat(id: number) {
  openChat = id;
}

function t(key: Parameters<typeof translate>[1]) {
  return translate(lang.get(), key);
}

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

async function setUpChannels() {
  if (Platform.OS !== 'android') return;
  const high = Notifications.AndroidImportance.HIGH;
  await Notifications.setNotificationChannelAsync('requests', { name: t('push.channel.requests'), importance: high });
  await Notifications.setNotificationChannelAsync('changes', { name: t('push.channel.changes'), importance: Notifications.AndroidImportance.DEFAULT });
  await Notifications.setNotificationChannelAsync('chat', { name: t('push.channel.chat'), importance: high });
}

async function setUpCategories() {
  // Opens the app: a background answer isn't reliable when the app was closed
  const open = { opensAppToForeground: true };
  await Notifications.setNotificationCategoryAsync('break_request', [
    { identifier: 'yes', buttonTitle: t('push.yes'), options: open },
    { identifier: 'no', buttonTitle: t('push.no'), options: open },
    { identifier: 'other', buttonTitle: t('push.other'), options: open },
  ]);
}

function set(s: PushState) {
  pushState.set(s);
  return s;
}

/**
 * Gets this phone ready for push and tells the server. `ask`: show the phone's question if it hasn't been asked yet
 * (only after a tap: never out of the blue). Never throws: the answer is in `pushState`.
 */
export async function registerPush(ask = false): Promise<PushState> {
  if (!SUPPORTED) return set('unsupported');
  try {
    // Android 13+: the phone only asks once a channel exists
    await setUpChannels();
    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask && canAskAgain) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') {
      // Turned off in the phone's settings: the server can stop sending to this phone
      if (await prefs.get<string | null>('push-token', null)) {
        await api.del('/api/v1/me/push-token').then(() => prefs.remove('push-token'), () => {});
      }
      return set(status === 'denied' ? 'denied' : 'undetermined');
    }
    await setUpCategories();
    const id = projectId();
    if (!id) return set('noProject');
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await api.put('/api/v1/me/push-token', { token: data });
    await prefs.set('push-token', data);
    return set('granted');
  } catch {
    return set('failed');
  }
}

/** A push came in or was tapped: what it's about is probably on screen somewhere, so ask for it again. */
function refresh(data: PushData) {
  if (data.kind === 'chat') {
    queryClient.invalidateQueries({ queryKey: ['chats'] });
    if (data.chat) queryClient.invalidateQueries({ queryKey: ['chat-messages', data.chat] });
  } else if (data.kind === 'schedule_change') {
    queryClient.invalidateQueries({ queryKey: ['today'] });
    queryClient.invalidateQueries({ queryKey: ['schedule'] });
  } else if (data.kind?.startsWith('break_')) {
    queryClient.invalidateQueries({ queryKey: ['breaks'] });
    queryClient.invalidateQueries({ queryKey: ['today'] });
  }
}

if (SUPPORTED) {
  // While the app is open: show it as a banner too, except a message in the chat you're reading
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const data = (n.request.content.data ?? {}) as PushData;
      refresh(data);
      const here = data.kind === 'chat' && !!data.chat && data.chat === openChat;
      return { shouldShowBanner: !here, shouldShowList: !here, shouldPlaySound: !here, shouldSetBadge: false };
    },
  });
}

async function onResponse(r: Notifications.NotificationResponse) {
  const data = (r.notification.request.content.data ?? {}) as PushData;
  refresh(data);
  if ((r.actionIdentifier === 'yes' || r.actionIdentifier === 'no') && data.request) {
    try {
      await api.post(`/api/v1/breaks/${data.request}/respond`, { response: r.actionIdentifier === 'yes' ? 'accepted' : 'declined' });
    } catch {
      // Gone, over, or no network: Today shows the request as it is
    }
    refresh(data);
    router.navigate('/today');
    return;
  }
  if (typeof data.url === 'string') router.navigate(data.url as Href);
}

/** Opening the app from a push (also when it was closed), and taps while it runs. Returns the clean-up. */
export function handlePushResponses(): () => void {
  if (!SUPPORTED) return () => {};
  const last = Notifications.getLastNotificationResponse();
  if (last) {
    Notifications.clearLastNotificationResponse();
    onResponse(last);
  }
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    Notifications.clearLastNotificationResponse();
    onResponse(r);
  });
  return () => sub.remove();
}

/** Ask the server to push to your own phones now (debug screen). */
export function sendTestPush() {
  return api.post<{ devices: number; mode: string }>('/api/v1/debug/push');
}
