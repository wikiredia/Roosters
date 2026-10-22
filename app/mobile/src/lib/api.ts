import * as Crypto from 'expo-crypto';

import { logRequest, type RequestLog } from './debuglog';
import { reportResult } from './net';
import { apiBase } from './server';
import { accessToken, clearSession, refreshToken, saveTokens, type Tokens } from './session';

/**
 * Talking to the Roosters+ API on bad school wifi:
 * - every request has a timeout (fetch has none by default)
 * - safe retries with backoff + jitter; writes carry an Idempotency-Key, so a retry never runs twice
 * - ETag: when nothing changed the server answers an empty 304 and we reuse what we had
 * - the school wifi login page (HTML instead of JSON) is recognised and reported, not shown as an error
 * - an expired access token is refreshed once (one refresh at a time, shared by all requests)
 * - every attempt is kept in a short log for the debug screen (lib/debuglog.ts)
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** No answer from our server: offline, timeout, school wifi login page, or a network that blocks us. */
export class NetworkError extends Error {
  constructor(
    public kind: 'offline' | 'timeout' | 'captive',
    /** What exactly happened, for the debug screen and error details */
    public log?: RequestLog,
  ) {
    super(kind);
  }
}

type Options = {
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
  /** Ask with If-None-Match and reuse the last answer on 304 */
  etag?: boolean;
  lang?: string;
};

const etags = new Map<string, { tag: string; data: unknown }>();
let refreshing: Promise<boolean> | null = null;
let currentLang = 'nl';

export function setApiLanguage(lang: string) {
  currentLang = lang;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoff(attempt: number) {
  return Math.min(8000, 600 * 2 ** attempt) + Math.random() * 400;
}

async function once(method: string, path: string, opts: Options, idemKey: string | null): Promise<unknown> {
  const url = apiBase() + path;
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': opts.lang ?? currentLang };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false && accessToken()) headers.Authorization = `Bearer ${accessToken()}`;
  if (idemKey) headers['Idempotency-Key'] = idemKey;
  const cached = opts.etag ? etags.get(url) : undefined;
  if (cached) headers['If-None-Match'] = cached.tag;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? (method === 'GET' ? 8000 : 15000));
  const started = Date.now();
  const entry = (outcome: string, more: Partial<RequestLog> = {}): RequestLog => {
    const e = { at: started, method, url, ms: Date.now() - started, outcome, ...more };
    logRequest(e);
    return e;
  };
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (e) {
    reportResult('network');
    const kind = controller.signal.aborted ? 'timeout' : 'offline';
    throw new NetworkError(kind, entry(kind, { snippet: e instanceof Error ? e.message : String(e) }));
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 304 && cached) {
    reportResult('ok');
    entry('ok', { status: 304 });
    return cached.data;
  }
  const type = res.headers.get('content-type') ?? '';
  // School wifi that isn't logged in answers every request with its own HTML page
  // (or, on a test server, another program answers on the API's port)
  if (res.status !== 204 && !type.includes('application/json')) {
    reportResult('captive');
    const snippet = await res.text().then((t) => t.replace(/\s+/g, ' ').trim().slice(0, 160), () => '');
    throw new NetworkError('captive', entry('not_json', { status: res.status, contentType: type, snippet }));
  }
  reportResult('ok');
  if (res.status === 204) {
    entry('ok', { status: 204 });
    return null;
  }
  const data = await res.json();
  if (!res.ok) {
    const { code = 'server', message = '', ...extra } = (data ?? {}) as Record<string, unknown>;
    entry(String(code), { status: res.status, contentType: type, snippet: String(message) });
    throw new ApiError(res.status, String(code), String(message), extra);
  }
  entry('ok', { status: res.status });
  const tag = res.headers.get('etag');
  if (opts.etag && tag) etags.set(url, { tag, data });
  return data;
}

async function refreshTokens(): Promise<boolean> {
  const token = refreshToken();
  if (!token) return false;
  refreshing ??= (async () => {
    try {
      const tokens = (await once('POST', '/api/v1/auth/refresh', { body: { refresh_token: token }, auth: false }, null)) as Tokens;
      await saveTokens(tokens);
      return true;
    } catch (e) {
      // Only a real "no" from the server ends the session; no network keeps the old tokens for later
      if (e instanceof ApiError && e.status === 401) await clearSession();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function request<T>(method: string, path: string, opts: Options = {}): Promise<T> {
  // One key for every retry of the same write: the server runs it at most once
  const idemKey = method !== 'GET' && opts.auth !== false ? Crypto.randomUUID() : null;
  const maxAttempts = 3;
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    try {
      return (await once(method, path, opts, idemKey)) as T;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && opts.auth !== false && !refreshed) {
        refreshed = true;
        if (await refreshTokens()) {
          attempt--;
          continue;
        }
      }
      const retryable =
        (e instanceof NetworkError && e.kind !== 'captive') ||
        (e instanceof ApiError && (e.status >= 500 || e.code === 'idempotency_busy'));
      if (!retryable || attempt + 1 >= maxAttempts) throw e;
      await sleep(backoff(attempt));
    }
  }
}

export const api = {
  get: <T>(path: string, opts?: Options) => request<T>('GET', path, { etag: true, ...opts }),
  post: <T>(path: string, body?: unknown, opts?: Options) => request<T>('POST', path, { ...opts, body: body ?? {} }),
  put: <T>(path: string, body?: unknown, opts?: Options) => request<T>('PUT', path, { ...opts, body: body ?? {} }),
  patch: <T>(path: string, body?: unknown, opts?: Options) => request<T>('PATCH', path, { ...opts, body: body ?? {} }),
  del: <T>(path: string, opts?: Options) => request<T>('DELETE', path, opts),
};
