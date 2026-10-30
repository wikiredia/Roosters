import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Input, Toggle } from '@/components/ui/Inputs';
import { Card, ListHead, Row } from '@/components/ui/Layout';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { api, ApiError, NetworkError } from '@/lib/api';
import { describe, requestLog } from '@/lib/debuglog';
import { type GoogleSupport, googleSupport } from '@/lib/google';
import { perfOverlay, resetColumnRenders } from '@/lib/perf';
import { pushState, registerPush, sendTestPush } from '@/lib/push';
import { apiOverride, automaticApiBase, setApiOverride, useDebug } from '@/lib/server';

/**
 * Server & debug: in development builds (or with EXPO_PUBLIC_DEBUG=1), and in every build for the owner's account
 * (lib/server useDebug).
 * Developer-facing, so English only and not translated on purpose.
 */

type Diagnose = {
  env: string;
  public_url: string;
  cors_origins: string[];
  mail: { mode: string; from: string; smtp_host: string; smtp_port: number; smtp: { checked: boolean; reachable?: boolean; greeting?: string; error?: string } };
  worker: { alive: boolean; id?: string; seen_seconds_ago?: number };
  login_mails: { id: number; status: string; attempts: number; last_error: string | null; created_at: string; age_seconds: number }[];
  hints: string[];
};

type Check = { ok: boolean; text: string } | null;

/** Why 'Continue with Google' does or doesn't show on this phone */
const GOOGLE_STATUS: Record<GoogleSupport, string> = {
  ready: 'Ready: the button shows on welcome (and for guests on the e-mail screen). The server needs the web client id in GOOGLE_CLIENT_IDS.',
  web: 'Not on the web: Google sign-in is native only.',
  expoGo: "Hidden in Expo Go: it needs native code. Use a development build (npx expo run:ios|android).",
  notConfigured: 'Hidden: set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and on iOS EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) in app/mobile/.env, then rebuild (iOS needs the URL scheme from app.config.ts) and restart Metro with -c.',
  notInBuild: 'Hidden: this build has no Google sign-in module. Make a new development build.',
};

function errorText(e: unknown) {
  if (e instanceof NetworkError && e.log) return describe(e.log);
  if (e instanceof ApiError) return `${e.status} ${e.code}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

export default function DebugScreen() {
  const debug = useDebug();
  const override = apiOverride.use();
  const auto = automaticApiBase();
  const current = override ?? auto.url;
  const log = requestLog.use();
  const [address, setAddress] = useState(override ?? '');
  const [conn, setConn] = useState<Check>(null);
  const [diag, setDiag] = useState<Diagnose | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [mailTo, setMailTo] = useState('');
  const [mailResult, setMailResult] = useState<Check>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const push = pushState.use();
  const overlay = perfOverlay.use();
  const [pushResult, setPushResult] = useState<Check>(null);

  if (!debug) return null;

  /** Registers this phone again (asking if needed), then has the server push to every phone you're signed in on. */
  async function testPush() {
    setBusy('push');
    setPushResult(null);
    try {
      const state = await registerPush(true);
      const r = await sendTestPush();
      setPushResult(
        r.devices
          ? { ok: true, text: r.mode === 'expo' ? `Sent to ${r.devices} phone(s) through Expo. It should arrive in a few seconds.` : `PUSH_MODE=${r.mode}: only in the API log.` }
          : { ok: false, text: `The server has no phone for you (here: ${state}).` },
      );
    } catch (e) {
      setPushResult({ ok: false, text: errorText(e) });
    } finally {
      setBusy(null);
    }
  }

  /** Plain fetch, no retries: shows exactly what answers on this address. */
  async function testConnection() {
    setBusy('conn');
    setConn(null);
    const url = `${current}/api/v1/health`;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const type = res.headers.get('content-type') ?? '';
      const body = (await res.text()).slice(0, 160);
      const ms = Date.now() - started;
      if (res.ok && type.includes('application/json') && body.includes('"ok"')) {
        setConn({ ok: true, text: `The Roosters+ API answers on ${current} (${ms} ms).` });
      } else {
        setConn({
          ok: false,
          text: `Something else answers on ${current}: ${res.status}, ${type || 'no content type'}. Start of the answer: "${body.replace(/\s+/g, ' ')}". Is this the right port? (docker compose ps shows the API's port)`,
        });
      }
    } catch (e) {
      setConn({
        ok: false,
        text: controller.signal.aborted
          ? `No answer from ${url} within 6 s: wrong IP, or a firewall drops it.`
          : `Could not connect to ${url} (${e instanceof Error ? e.message : e}). Wrong address or port, the API isn't running, a firewall, or (web only) CORS_ORIGINS missing in .env.`,
      });
    } finally {
      clearTimeout(timer);
      setBusy(null);
    }
  }

  async function checkMail() {
    setBusy('diag');
    setDiagError(null);
    try {
      setDiag(await api.get<Diagnose>('/api/v1/debug', { etag: false }));
    } catch (e) {
      setDiag(null);
      setDiagError(e instanceof ApiError && e.status === 404 ? 'The server has no debug endpoint for you: it runs with ENV other than dev and you are not signed in as the owner\'s account, or it is an older version.' : errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function sendTestMail() {
    setBusy('mail');
    setMailResult(null);
    try {
      const r = await api.post<{ ok: boolean; mode: string; error?: string }>('/api/v1/debug/mail', { email: mailTo.trim() }, { auth: false });
      setMailResult(
        r.ok
          ? { ok: true, text: r.mode === 'smtp' ? 'Sent. It should be in Mailpit (port 8025) now.' : `Sent with MAIL_MODE=${r.mode}: only in the worker/API log, not in Mailpit.` }
          : { ok: false, text: `The SMTP server refused or couldn't be reached: ${r.error}` },
      );
    } catch (e) {
      setMailResult({ ok: false, text: errorText(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen back navTitle="Server & debug" noBanner>
      <View>
        <ListHead>Server</ListHead>
        <Card className="p-4 gap-3">
          <Text variant="sm" tone="ink2">
            The app talks to
          </Text>
          <Text bold selectable>
            {current}
          </Text>
          <Text variant="xs" tone="ink3">
            {override
              ? 'Set on this device.'
              : auto.source === 'env'
                ? 'From EXPO_PUBLIC_API_URL (baked in at build time; restart Expo with -c after changing it).'
                : auto.source === 'web'
                  ? `Automatic: this page's host, port ${process.env.EXPO_PUBLIC_API_PORT || '8000'} (EXPO_PUBLIC_API_PORT).`
                  : `Automatic: the computer running expo start, port ${process.env.EXPO_PUBLIC_API_PORT || '8000'} (EXPO_PUBLIC_API_PORT).`}
          </Text>
          <Input
            label="Use another address"
            placeholder="192.168.1.20:8010"
            value={address}
            onChangeText={setAddress}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <View className="flex-row gap-2">
            <Button size="sm" label="Save" disabled={!address.trim()} onPress={() => setApiOverride(address).then(() => setConn(null))} />
            <Button
              size="sm"
              variant="secondary"
              label="Back to automatic"
              disabled={!override}
              onPress={() => {
                setAddress('');
                setApiOverride(null).then(() => setConn(null));
              }}
            />
          </View>
          <Button variant="tonal" icon="wifi" label="Test connection" loading={busy === 'conn'} onPress={testConnection} />
          {conn ? <Banner kind={conn.ok ? 'neutral' : 'bad'} title={conn.ok ? 'Connected' : 'Not connected'} body={conn.text} /> : null}
        </Card>
      </View>

      <View>
        <ListHead>Login mail</ListHead>
        <Card className="p-4 gap-3">
          <Text variant="sm" tone="ink2">
            Asks the server: mail settings, can it reach the SMTP server (Mailpit), is a worker running, and what happened to the last login codes.
          </Text>
          <Button variant="tonal" icon="mail" label="Check mail setup" loading={busy === 'diag'} onPress={checkMail} />
          {diagError ? <Banner kind="bad" title="Couldn't ask the server" body={diagError} /> : null}
          {diag ? <DiagView d={diag} /> : null}
          <Input label="Send a test mail to" placeholder="you@example.com" value={mailTo} onChangeText={setMailTo} autoCapitalize="none" keyboardType="email-address" />
          <Button variant="secondary" label="Send test mail" disabled={!mailTo.includes('@')} loading={busy === 'mail'} onPress={sendTestMail} />
          {mailResult ? <Banner kind={mailResult.ok ? 'neutral' : 'bad'} title={mailResult.ok ? 'Test mail' : 'Test mail failed'} body={mailResult.text} /> : null}
        </Card>
      </View>

      <View>
        <ListHead>Push</ListHead>
        <Card className="p-4 gap-3">
          <Text variant="sm" tone="ink2">
            {`On this phone: ${push}. Needs a development build (not Expo Go on Android) and extra.eas.projectId in app.json (npx eas-cli init).`}
          </Text>
          <Button variant="tonal" icon="bell" label="Send a test push" loading={busy === 'push'} onPress={testPush} />
          {pushResult ? <Banner kind={pushResult.ok ? 'neutral' : 'bad'} title={pushResult.ok ? 'Test push' : 'Test push failed'} body={pushResult.text} /> : null}
        </Card>
      </View>

      <View>
        <ListHead>Performance</ListHead>
        <Card>
          <Row
            first
            title="fps overlay"
            sub="UI and JS fps, how often the Rooster tab's day columns re-render, and the size of the saved cache. Over every screen until you switch it off or restart the app. For measuring in a release build, make it with EXPO_PUBLIC_DEBUG=1."
            right={<Toggle value={overlay} onChange={perfOverlay.set} label="fps overlay" />}
          />
        </Card>
        <Button variant="ghost" size="sm" label="Reset the column render counter" onPress={resetColumnRenders} className="self-start mt-2" />
      </View>

      <View>
        <ListHead>Sign in with Google</ListHead>
        <Card className="p-4">
          <Text variant="sm" tone="ink2">
            {GOOGLE_STATUS[googleSupport()]}
          </Text>
        </Card>
      </View>

      <View>
        <ListHead>{`Last requests (${log.length})`}</ListHead>
        <Card>
          {log.length === 0 ? (
            <View className="p-4">
              <Text tone="ink2">Nothing yet.</Text>
            </View>
          ) : (
            log.map((e, i) => (
              <Row
                key={`${e.at}-${i}`}
                first={i === 0}
                title={`${e.outcome === 'ok' ? '✓' : e.recovered ? '↻' : '✗'} ${e.method} ${e.url.replace(current, '')}`}
                sub={[describe(e).split(' → ')[1], `${e.ms} ms`, new Date(e.at).toLocaleTimeString(), e.snippet].filter(Boolean).join(' · ')}
                tone={e.outcome === 'ok' || e.recovered ? 'ink' : 'danger'}
              />
            ))
          )}
        </Card>
        <Button variant="ghost" size="sm" label="Clear" onPress={() => requestLog.set([])} className="self-start mt-2" />
      </View>
    </Screen>
  );
}

function DiagView({ d }: { d: Diagnose }) {
  const smtp = d.mail.smtp;
  return (
    <View className="gap-2">
      {d.hints.map((h) => (
        <Banner key={h} kind="bad" title="To fix" body={h} />
      ))}
      <Card>
        <Row first title="ENV" right={<Text>{d.env}</Text>} />
        <Row title="MAIL_MODE" right={<Text>{d.mail.mode}</Text>} />
        <Row title="SMTP server" right={<Text>{`${d.mail.smtp_host}:${d.mail.smtp_port}`}</Text>} />
        {smtp.checked ? <Row title="SMTP reachable" sub={smtp.reachable ? smtp.greeting : smtp.error} right={<Text>{smtp.reachable ? 'yes' : 'no'}</Text>} /> : null}
        <Row
          title="Worker"
          right={<Text>{d.worker.alive ? `running (${d.worker.seen_seconds_ago} s ago)` : 'not running'}</Text>}
        />
        <Row title="CORS_ORIGINS" right={<Text>{d.cors_origins.join(', ') || '(none)'}</Text>} />
        <Row title="PUBLIC_URL" sub={d.public_url} />
      </Card>
      {d.login_mails.length ? (
        <Card>
          {d.login_mails.map((j, i) => (
            <Row
              key={j.id}
              first={i === 0}
              title={`Login mail #${j.id}: ${j.status}`}
              sub={[`${j.attempts} attempts`, `${Math.round(j.age_seconds / 60)} min ago`, j.last_error].filter(Boolean).join(' · ')}
              tone={j.status === 'done' ? 'ink' : 'danger'}
            />
          ))}
        </Card>
      ) : null}
    </View>
  );
}
