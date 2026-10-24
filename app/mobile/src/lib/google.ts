import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import type { Tokens } from '@/api/types';

import { api } from './api';
import { afterSignIn, device, freshenGuestToken } from './onboarding';

/**
 * Sign in with Google (react-native-nitro-google-signin: Credential Manager on Android, Google's SDK on iOS).
 * The phone gets an ID token from Google, our server checks it (`POST /api/v1/auth/google`,
 * `api/roosters/providers.google`) and answers with our own tokens, like Apple and e-mail.
 *
 * The token's audience is the **web** client id (`webClientId`, on Android and iOS alike), so that id must
 * be in the server's `GOOGLE_CLIENT_IDS`. Client ids are no secret; they come from `app/mobile/.env` or EAS.
 */

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

/** Why the button is hidden (shown on the debug screen), or `ready` */
export type GoogleSupport = 'ready' | 'web' | 'expoGo' | 'notConfigured' | 'notInBuild';

type Lib = typeof import('react-native-nitro-google-signin');
let lib: Lib | null = null;
let support: GoogleSupport | null = null;

/** Loaded only when it can work: the module talks to native code as soon as it's imported (Expo Go would crash) */
function load(): Lib {
  if (!lib) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- on purpose: loaded on first use only
    const l = require('react-native-nitro-google-signin') as Lib;
    l.GoogleOneTapSignIn.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID || null });
    lib = l;
  }
  return lib;
}

export function googleSupport(): GoogleSupport {
  if (support) return support;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') support = 'web';
  else if (isRunningInExpoGo()) support = 'expoGo';
  // iOS needs its own client id too (and the URL scheme made from it at build time, see app.config.ts)
  else if (!WEB_CLIENT_ID || (Platform.OS === 'ios' && !IOS_CLIENT_ID)) support = 'notConfigured';
  else {
    try {
      // A development build from before this module was added: no native side, no button
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- a missing native module must not crash the import
      const { NitroModules } = require('react-native-nitro-modules') as typeof import('react-native-nitro-modules');
      support = NitroModules.hasHybridObject('NitroGoogleSignin') ? 'ready' : 'notInBuild';
    } catch {
      support = 'notInBuild';
    }
  }
  return support;
}

/** What went wrong on the phone's side, for a short text under the buttons */
export type GoogleProblem = 'playServices' | 'notSetUp' | 'failed';

export class GoogleError extends Error {
  constructor(
    readonly problem: GoogleProblem,
    readonly detail: string,
  ) {
    super(detail);
  }
}

/** Google's account picker → an ID token, or null when the student closed it. */
async function idToken(): Promise<string | null> {
  let g: Lib;
  try {
    g = load();
  } catch (e) {
    // configure() refused the client ids
    throw new GoogleError('notSetUp', e instanceof Error ? e.message : String(e));
  }
  try {
    await g.GoogleOneTapSignIn.checkPlayServices();
    // The explicit 'Sign in with Google' dialog (all accounts, add one): this is a button press, not a prompt
    // (On Android a 'cancelled' right after picking an account usually means a missing SHA-1: see the auth guide)
    const res = await g.GoogleOneTapSignIn.presentExplicitSignIn();
    if (!g.isSuccessResponse(res) || !res.data.idToken) return null;
    // We keep our own session, not Google's: the next tap asks which account again (a shared phone)
    g.GoogleOneTapSignIn.signOut().catch(() => {});
    return res.data.idToken;
  } catch (e) {
    if (g.isErrorWithCode(e)) {
      if (e.code === g.statusCodes.SIGN_IN_CANCELLED) return null;
      if (e.code === g.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new GoogleError('playServices', `${e.code}: ${e.message}`);
      // Wrong SHA-1, package name or client id (Android)
      if (e.code === g.statusCodes.DEVELOPER_ERROR) throw new GoogleError('notSetUp', `${e.code}: ${e.message}`);
      throw new GoogleError('failed', `${e.code}: ${e.message}`);
    }
    throw new GoogleError('failed', e instanceof Error ? e.message : String(e));
  }
}

/**
 * The whole sign-in: Google, then our server, then `afterSignIn`. A guest sends their token along (like the
 * e-mail code), so the server upgrades that account. Returns false when the student cancelled.
 * Throws GoogleError (the phone's side) or ApiError / NetworkError (our server).
 */
export async function signInWithGoogle(): Promise<boolean> {
  const token = await idToken();
  if (!token) return false;
  await freshenGuestToken();
  const tokens = await api.post<Tokens>('/api/v1/auth/google', { id_token: token, ...device });
  await afterSignIn(tokens);
  return true;
}
