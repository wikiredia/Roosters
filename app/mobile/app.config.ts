import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json plus the parts that come from the environment (`app/mobile/.env`, or EAS environment variables):
 * Sign in with Google's iOS URL scheme. Expo reads app.json first and hands it to this function.
 */

/** Stands in for the iOS URL scheme until there is an iOS client id: the plugin must run on every iOS build
 * (it fixes the Google pods in the Podfile), and the app hides the Google button without the id anyway. */
export const GOOGLE_SCHEME_UNSET = 'com.googleusercontent.apps.roostersplus-not-configured';

/** `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc` (Google's REVERSED_CLIENT_ID) */
export function googleIosUrlScheme(iosClientId: string | undefined): string {
  const id = (iosClientId ?? '').trim().replace(/\.apps\.googleusercontent\.com$/, '');
  return id ? `com.googleusercontent.apps.${id}` : GOOGLE_SCHEME_UNSET;
}

export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ['react-native-nitro-google-signin', { iosUrlScheme: googleIosUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) }],
    ],
  }) as ExpoConfig;
