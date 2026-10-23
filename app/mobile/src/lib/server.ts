import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { prefs } from './storage';
import { createStore } from './store';

/**
 * Which Roosters+ API the app talks to. In order:
 * 1. an address set on the debug screen (saved on this device, no rebuild needed)
 * 2. EXPO_PUBLIC_API_URL, baked in when Metro builds the app (restart with `expo start -c` after changing it)
 * 3. the computer that runs `expo start` (or serves the web build), on EXPO_PUBLIC_API_PORT (default 8000)
 */
export const apiOverride = createStore<string | null>(null);

/** The debug screen and error details: always in development, in other builds with EXPO_PUBLIC_DEBUG=1. */
export const debugEnabled = __DEV__ || process.env.EXPO_PUBLIC_DEBUG === '1';

const PORT = process.env.EXPO_PUBLIC_API_PORT || '8000';

export function automaticApiBase(): { url: string; source: 'env' | 'web' | 'expo' } {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return { url: fromEnv.replace(/\/$/, ''), source: 'env' };
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return { url: `${window.location.protocol}//${window.location.hostname}:${PORT}`, source: 'web' };
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return { url: `http://${host ?? 'localhost'}:${PORT}`, source: 'expo' };
}

export function apiBase(): string {
  return apiOverride.get() ?? automaticApiBase().url;
}

export async function loadServer() {
  if (!debugEnabled) return;
  apiOverride.set(await prefs.get<string | null>('apiUrl', null));
}

/** "192.168.1.20:8010" -> "http://192.168.1.20:8010"; null goes back to automatic. */
export async function setApiOverride(url: string | null) {
  let value = url?.trim().replace(/\/+$/, '') || null;
  if (value && !/^https?:\/\//i.test(value)) value = `http://${value}`;
  apiOverride.set(value);
  if (value) await prefs.set('apiUrl', value);
  else await prefs.remove('apiUrl');
}
