import { Platform } from 'react-native';

import { useAcceptInvite, useMe, useUpdateMe } from '@/api/hooks';
import type { Tokens } from '@/api/types';

import { api } from './api';
import { takePendingInvite } from './invite';
import { resetTo } from './nav';
import { queryClient } from './query';
import { saveTokens, session } from './session';

/**
 * Racing through onboarding: every step can be skipped, and you can start without signing in (a guest
 * account on this phone). What's left shows on Today as "Complete the following steps" (SetupSteps).
 */

export const device = {
  platform: Platform.OS,
  device_name: Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Web',
};

/** "Continue without signing in": a guest account, no e-mail. Friends wait until they add one. */
export async function startAsGuest() {
  const tokens = await api.post<Tokens>('/api/v1/auth/guest', device, { auth: false });
  await saveTokens(tokens);
}

/** Before signing in while already in the app (a guest adding e-mail): make sure the access token is
 * fresh, so the server sees the guest and upgrades that account instead of making a new one. */
export async function freshenGuestToken() {
  if (session.get().status !== 'signedIn') return;
  try {
    await api.get('/api/v1/me');
  } catch {
    // Offline or signed out: the sign-in still works, just without keeping the guest's setup
  }
}

/** After any sign-in: new tokens, forget what we showed for the guest, accept an invite that was waiting. */
export async function afterSignIn(tokens: Tokens) {
  await saveTokens(tokens);
  await queryClient.invalidateQueries();
  const code = await takePendingInvite();
  if (code) {
    try {
      await api.post(`/api/v1/invites/${encodeURIComponent(code)}/accept`);
    } catch {
      // Expired or already friends: nothing to do
    }
  }
}

/** Skip the rest (or finish): marks onboarding done and goes to Today. */
export function useFinishOnboarding() {
  const me = useMe();
  const update = useUpdateMe();
  const accept = useAcceptInvite();
  async function finish() {
    try {
      await update.mutateAsync({ onboarded: true });
    } catch {
      // Offline: Today works from what we have, the gate asks again next time
    }
    if (me.data && !me.data.guest) {
      const code = await takePendingInvite();
      if (code) accept.mutate(code);
    }
    resetTo('/today');
  }
  return { finish, busy: update.isPending };
}
