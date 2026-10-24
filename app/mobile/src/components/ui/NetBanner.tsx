import * as Linking from 'expo-linking';

import { useT } from '@/i18n';
import { netState } from '@/lib/net';

import { Banner } from './Bits';
import { Button } from './Button';
import { Reveal } from './Motion';

/** Never a full-screen error: what was loaded stays visible, this small banner says why it's old.
 * It fades in and out, and the page slides instead of jumping. */
export function NetBanner() {
  const banner = useBanner();
  return banner ? <Reveal>{banner}</Reveal> : null;
}

function useBanner() {
  const state = netState.use();
  const { t } = useT();
  if (state === 'offline') {
    return <Banner kind="ink" icon="wifiOff" title={t('net.offline')} />;
  }
  if (state === 'captive') {
    return (
      <Banner
        kind="bad"
        icon="wifi"
        title={t('net.captive.title')}
        body={t('net.captive.body')}
        action={
          // A plain-http page makes the phone show the wifi login page
          <Button size="sm" variant="ink" label={t('net.captive.open')} onPress={() => Linking.openURL('http://neverssl.com')} />
        }
      />
    );
  }
  if (state === 'blocked') {
    return <Banner kind="bad" icon="wifiOff" title={t('net.blocked.title')} body={t('net.blocked.body')} />;
  }
  return null;
}
