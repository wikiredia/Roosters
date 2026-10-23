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
};

const MAX = 40;

export const requestLog = createStore<RequestLog[]>([]);

export function logRequest(entry: RequestLog) {
  requestLog.set([entry, ...requestLog.get()].slice(0, MAX));
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
          : e.status
            ? `${e.status} ${e.outcome}`
            : e.outcome;
  return `${where} → ${what}`;
}
