import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import QRCode from 'qrcode';
import { useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { useAcceptInvite, useInvite } from '@/api/hooks';
import { AppIcon } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Card, Section, SectionHead } from '@/components/ui/Layout';
import { AView, enter } from '@/components/ui/Motion';
import { Skeleton } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/i18n';
import { ApiError } from '@/lib/api';

/** The QR code and the camera square are the same size: small, never the whole screen. */
function useSide() {
  return Math.min(232, useWindowDimensions().width - 96);
}

/** "AB12CD34" out of a scanned link (https://…/i/AB12CD34, roostersplus://i/AB12CD34) or a bare code. */
export function codeFrom(data: string): string | null {
  const s = data.trim();
  const link = s.match(/\/i\/([A-Za-z0-9]{6,16})\/?$/);
  if (link) return link[1].toUpperCase();
  return /^[A-Za-z0-9]{6,16}$/.test(s) ? s.toUpperCase() : null;
}

/**
 * Your own QR code: your invite link, drawn here (no service), black on white with the logo in the middle (the
 * highest error correction, so the logo covering a few modules doesn't matter). A friend scans it with
 * "Scan een code" below, or with their phone's camera (the link opens the app).
 */
export function QrCard() {
  const { t } = useT();
  const invite = useInvite();
  const side = useSide();
  return (
    <Section>
      <SectionHead title={t('qr.title')} />
      <Card className="p-4 items-center gap-3">
        {invite.data?.url ? <Qr value={invite.data.url} size={side} /> : <Skeleton className="rounded-card" width={side} />}
        <Text variant="sm" tone="ink2" className="text-center">
          {t('qr.body')}
        </Text>
      </Card>
    </Section>
  );
}

function Qr({ value, size }: { value: string; size: number }) {
  const { d, n, logo } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'H' });
    const count = qr.modules.size;
    // The middle (about a fifth) stays white for the logo
    const hole = Math.floor(count * 0.22) | 1;
    const h0 = (count - hole) / 2;
    let path = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        const inHole = r >= h0 && r < h0 + hole && c >= h0 && c < h0 + hole;
        if (!inHole && qr.modules.get(r, c)) path += `M${c} ${r}h1v1h-1z`;
      }
    }
    return { d: path, n: count, logo: { at: h0, size: hole } };
  }, [value]);
  const quiet = 2;
  const box = n + quiet * 2;
  const unit = size / box;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={value} style={{ width: size, height: size }} className="bg-white rounded-card overflow-hidden">
      <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${box} ${box}`}>
        <Rect x={-quiet} y={-quiet} width={box} height={box} fill="#FFFFFF" />
        <Path d={d} fill="#000000" />
      </Svg>
      <View className="absolute items-center justify-center" style={{ left: (logo.at + quiet) * unit, top: (logo.at + quiet) * unit, width: logo.size * unit, height: logo.size * unit }}>
        <AppIcon size={logo.size * unit - unit} mono />
      </View>
    </View>
  );
}

/**
 * "Scan een code": a camera icon opens a small square of the camera right here (the size of the QR code above, just
 * big enough to see what it's doing). A friend's QR code in it makes you friends at once; tap again to close it.
 */
export function ScanCard() {
  const { t } = useT();
  const side = useSide();
  const [open, setOpen] = useState(false);
  const [perm, ask] = useCameraPermissions();
  const accept = useAcceptInvite();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  async function start() {
    setError(null);
    if (open) return setOpen(false);
    const p = perm?.granted ? perm : await ask();
    if (!p.granted) return setError(t('qr.noCamera'));
    setOpen(true);
  }

  async function scanned(data: string) {
    if (busy.current) return;
    const code = codeFrom(data);
    if (!code) return setError(t('qr.notOurs'));
    busy.current = true;
    try {
      await accept.mutateAsync(code);
      setOpen(false);
      router.replace('/friends');
    } catch (e) {
      setError(e instanceof ApiError ? t(e.code === 'invite_self' ? 'add.ownCode' : 'add.badCode') : t('common.offline'));
      // Give the camera a moment before it tries the same code again
      setTimeout(() => (busy.current = false), 2500);
    }
  }

  return (
    <Section>
      <SectionHead title={t('qr.scanTitle')} />
      <Card className="p-4 items-center gap-3">
        {open ? (
          <AView entering={enter} style={{ width: side, height: side }} className="rounded-card overflow-hidden bg-ink">
            <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={accept.isPending ? undefined : (r) => scanned(r.data)} />
            {/* Corners: where to hold the code */}
            <View pointerEvents="none" className="absolute inset-6 border-2 border-white/80 rounded-card" />
          </AView>
        ) : null}
        <Button variant={open ? 'secondary' : 'primary'} icon={open ? 'close' : 'camera'} label={open ? t('qr.stop') : t('qr.scan')} loading={accept.isPending} onPress={start} />
        {error ? (
          <Text variant="sm" bold tone="danger" className="text-center" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : !open ? (
          <View className="flex-row items-center gap-2">
            <Icon name="qr" size={18} color="ink-3" />
            <Text variant="sm" tone="ink2">
              {t('qr.scanBody')}
            </Text>
          </View>
        ) : null}
      </Card>
    </Section>
  );
}
