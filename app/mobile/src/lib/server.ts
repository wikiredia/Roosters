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

/** A development build, or one built with EXPO_PUBLIC_DEBUG=1: the debug tools for everyone using it. */
export const debugBuild = __DEV__ || process.env.EXPO_PUBLIC_DEBUG === '1';

/**
 * The owner's account (the API's `User.debug`, api/roosters/debug.allowed) uses this phone: the debug tools in every
 * build, production too. Set from every /me answer and remembered on the device, so they're there at the next start
 * before /me answers and on the sign-in screens (the gate, welcome, login) after signing out.
 */
export const debugAccount = createStore(false);

/** The debug screens, the fps overlay and error details: a debug build, or the owner's account on this phone. */
export const isDebug = () => debugBuild || debugAccount.get();

/** `isDebug` for screens: shows or hides when /me changes it. */
export function useDebug() {
  return debugAccount.use() || debugBuild;
}

/** What /me says about the account on this phone (lib/session, api/hooks.useMe). */
export async function setDebugAccount(on: boolean) {
  if (on === debugAccount.get()) return;
  debugAccount.set(on);
  await prefs.set('debugAccount', on);
}

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
  debugAccount.set(await prefs.get<boolean>('debugAccount', false));
  if (!isDebug()) return;
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
