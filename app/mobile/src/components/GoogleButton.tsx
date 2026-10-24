import { useState } from 'react';
import { ActivityIndicator, Text as RNText } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import { APressable, usePressScale } from '@/components/ui/Motion';
import { useT } from '@/i18n';
import type { Key } from '@/i18n/nl';
import { ApiError, NetworkError } from '@/lib/api';
import { GoogleError, type GoogleProblem, googleSupport, signInWithGoogle } from '@/lib/google';
import { resetTo } from '@/lib/nav';

const PROBLEM: Record<GoogleProblem, Key> = {
  playServices: 'google.playServices',
  notSetUp: 'google.notSetUp',
  failed: 'google.failed',
};

/**
 * 'Ga verder met Google', after Google's branding guidelines: the full-colour G, Google's light or dark fill
 * with its 1px stroke (tokens --color-google-*), the same size and corners as the Apple button next to it.
 * Renders nothing where it can't work (web, Expo Go, no client ids, a build without the module).
 */
export function GoogleButton({ onError }: { onError: (message: string | null, detail?: string) => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const press = usePressScale(0.97);
  const ink = String(useCSSVariable('--color-google-ink') ?? '#1F1F1F');
  if (googleSupport() !== 'ready') return null;

  async function go() {
    onError(null);
    setBusy(true);
    try {
      if (await signInWithGoogle()) resetTo('/');
    } catch (e) {
      if (e instanceof GoogleError) {
        onError(t(PROBLEM[e.problem]), e.detail);
      } else {
        // Our server said no (provider_unavailable: no GOOGLE_CLIENT_IDS; provider_invalid: wrong audience), or no network
        const why = e instanceof ApiError ? `POST /auth/google → ${e.status} ${e.code}` : e instanceof Error ? e.message : String(e);
        onError(e instanceof ApiError ? e.message : e instanceof NetworkError ? t('common.offline') : t('common.tryAgain'), why);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <APressable
      accessibilityRole="button"
      accessibilityLabel={t('welcome.google')}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={go}
      className="min-h-[52px] px-5 rounded-button self-stretch flex-row items-center justify-center gap-3 bg-google-fill border border-google-stroke"
      {...press.handlers}
      style={press.style}
    >
      {busy ? <ActivityIndicator size="small" color={ink} /> : <GoogleG size={20} />}
      <RNText className="font-ui-bold text-base text-google-ink" numberOfLines={1}>
        {t('welcome.google')}
      </RNText>
    </APressable>
  );
}

/** Google's standard 'G' (never recoloured) */
function GoogleG({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}
