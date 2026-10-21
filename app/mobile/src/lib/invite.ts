import { prefs } from './storage';

/**
 * Invite links: someone opens roostersplus://i/<code> (later https://<domain>/i/<code>) before they have
 * an account. We keep the code and accept it as soon as they finished onboarding.
 */
export async function setPendingInvite(code: string) {
  await prefs.set('pendingInvite', code.trim().toUpperCase());
}

export async function takePendingInvite(): Promise<string | null> {
  const code = await prefs.get<string | null>('pendingInvite', null);
  if (code) await prefs.remove('pendingInvite');
  return code;
}
