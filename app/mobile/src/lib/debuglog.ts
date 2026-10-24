import { createStore } from './store';

/** One request as the app saw it, for the debug screen. Never holds tokens or request bodies. */
export type RequestLog = {
  at: number;
  method: string;
  url: string;
  ms: number;
  status?: number;
  contentType?: string;
  /** ok, an API error code, or what went wrong on the way */
  outcome: string;
  /** Start of an answer that wasn't JSON: shows who answered instead of our API */
  snippet?: string;
  /** A 401 the app got past: it refreshed the tokens and asked again (the next entry for this URL) */
  recovered?: boolean;
};

const MAX = 40;

export const requestLog = createStore<RequestLog[]>([]);

export function logRequest(entry: RequestLog) {
  requestLog.set([entry, ...requestLog.get()].slice(0, MAX));
}

/** The latest 401 for this request was followed by a token refresh that worked: it's no failure. */
export function markRecovered(method: string, url: string) {
  const log = requestLog.get();
  const i = log.findIndex((e) => e.method === method && e.url === url && e.status === 401);
  if (i < 0) return;
  requestLog.set(log.map((e, j) => (j === i ? { ...e, recovered: true } : e)));
}

/** One line for an error message: "POST http://…/email/start → HTML instead of JSON (200, text/html)" */
export function describe(e: RequestLog) {
  const where = `${e.method} ${e.url}`;
  const what =
    e.outcome === 'timeout'
      ? `no answer within the time limit (${Math.round(e.ms / 1000)} s)`
      : e.outcome === 'offline'
        ? 'could not connect (wrong address or port, firewall, or CORS on the web)'
        : e.outcome === 'not_json'
          ? `something else answered instead of the Roosters+ API (${e.status}, ${e.contentType || 'no content type'})`
          : e.recovered
            ? `${e.status} ${e.outcome}, token refreshed and asked again`
            : e.status
              ? `${e.status} ${e.outcome}`
              : e.outcome;
  return `${where} → ${what}`;
}
