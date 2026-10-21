import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

import { createStore } from './store';

/**
 * What the network looks like from the app, for the banners on every screen:
 * - offline: no connection at all
 * - captive: school wifi shows its login page instead of our answers
 * - blocked: there is internet, but this network stops our requests (firewall, TLS inspection)
 */
export type NetState = 'ok' | 'offline' | 'captive' | 'blocked';

export const netState = createStore<NetState>('ok');
let failuresWhileOnline = 0;

/** Called by the API client after every request. */
export function reportResult(result: 'ok' | 'network' | 'captive') {
  if (result === 'ok') {
    failuresWhileOnline = 0;
    netState.set('ok');
    return;
  }
  if (result === 'captive') {
    netState.set('captive');
    return;
  }
  if (netState.get() === 'offline') return;
  // The phone says it's online, but our requests keep failing: probably the network blocks us
  failuresWhileOnline += 1;
  if (failuresWhileOnline >= 3) netState.set('blocked');
}

/** Follow the phone's connection, and let React Query pause/resume with it. */
export function startNetworkWatch() {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((s) => {
      const online = s.isConnected !== false && s.isInternetReachable !== false;
      setOnline(online);
      if (!online) netState.set('offline');
      else if (netState.get() === 'offline') netState.set('ok');
    }),
  );
}
