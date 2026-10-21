import { secrets } from './storage';
import { createStore } from './store';

/** Signed-in state. Tokens live in the phone's secure storage; the access token also in memory. */
export type Session = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn' };

export type Tokens = { access_token: string; refresh_token: string; expires_in: number };

export const session = createStore<Session>({ status: 'loading' });

let access: string | null = null;
let refresh: string | null = null;

export function accessToken() {
  return access;
}

export function refreshToken() {
  return refresh;
}

export async function loadSession() {
  try {
    access = await secrets.get('access');
    refresh = await secrets.get('refresh');
  } catch {
    access = refresh = null;
  }
  session.set(refresh ? { status: 'signedIn' } : { status: 'signedOut' });
}

export async function saveTokens(t: Tokens) {
  access = t.access_token;
  refresh = t.refresh_token;
  await secrets.set('access', t.access_token);
  await secrets.set('refresh', t.refresh_token);
  if (session.get().status !== 'signedIn') session.set({ status: 'signedIn' });
}

export async function clearSession() {
  access = refresh = null;
  await Promise.all([secrets.remove('access'), secrets.remove('refresh')]);
  session.set({ status: 'signedOut' });
}
