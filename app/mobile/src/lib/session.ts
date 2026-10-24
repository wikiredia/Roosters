import { secrets } from './storage';
import { createStore } from './store';

/**
 * Signed-in state. Tokens live in the phone's secure storage; the access token also in memory.
 * `ended`: the server ended the session (why, from its `reason`: logout, reuse, expired, …), shown on welcome.
 */
export type Session = { status: 'loading' } | { status: 'signedOut'; ended?: string } | { status: 'signedIn' };

export type Tokens = { access_token: string; refresh_token: string; expires_in: number };

export const session = createStore<Session>({ status: 'loading' });

let access: string | null = null;
let refresh: string | null = null;
/** When the access token runs out, by this phone's clock (from `expires_in`, so a wrong clock doesn't matter) */
let accessUntil = 0;

export function accessToken() {
  return access;
}

export function refreshToken() {
  return refresh;
}

/** The access token runs out within a minute (or it's unknown when): refresh before asking. */
export function accessExpiresSoon() {
  return !!refresh && (!access || Date.now() > accessUntil - 60_000);
}

export async function loadSession() {
  try {
    access = await secrets.get('access');
    refresh = await secrets.get('refresh');
    accessUntil = Number((await secrets.get('access_until')) ?? 0) || 0;
  } catch {
    access = refresh = null;
  }
  session.set(refresh ? { status: 'signedIn' } : { status: 'signedOut' });
}

export async function saveTokens(t: Tokens) {
  access = t.access_token;
  refresh = t.refresh_token;
  accessUntil = Date.now() + t.expires_in * 1000;
  if (session.get().status !== 'signedIn') session.set({ status: 'signedIn' });
  // Saved before anything uses the new pair: once it's used, the server no longer takes the old refresh token.
  // A keychain that says no (very rare) gets a second try; after that the pair in memory still works until the app closes.
  for (let i = 0; i < 2; i++) {
    try {
      await secrets.set('refresh', t.refresh_token);
      await secrets.set('access', t.access_token);
      await secrets.set('access_until', String(accessUntil));
      return;
    } catch {}
  }
}

export async function clearSession(ended?: string) {
  access = refresh = null;
  accessUntil = 0;
  await Promise.all([secrets.remove('access'), secrets.remove('refresh'), secrets.remove('access_until')]).catch(() => {});
  session.set({ status: 'signedOut', ended });
}
