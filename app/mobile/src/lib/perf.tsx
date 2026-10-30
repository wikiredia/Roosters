import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react';

import { isDebug } from './server';
import { createStore } from './store';

/**
 * Measuring the Rooster tab (guide 'Plan: a fast Rooster tab'). Everything here is for developers: the overlay
 * only exists where `isDebug()` (lib/server: development builds, a build with EXPO_PUBLIC_DEBUG=1 to measure in
 * release, or the owner's account in any build), and it starts off.
 */

/** The fps overlay (components/PerfOverlay.tsx), toggled on the Server & debug screen. Off at every start. */
export const perfOverlay = createStore(false);

/** How big the persisted query cache was at its last write, and how long `JSON.stringify` took (lib/query.ts). */
export const cacheStats = createStore<{ bytes: number; ms: number; writes: number } | null>(null);

/** Commits slower than this (ms) are logged by `PerfProfile`. */
const SLOW_COMMIT_MS = 8;

const columns = { renders: 0, since: Date.now(), perDay: new Map<number, number>() };

/** One render of a day column (DayGrid.DayColumn), counted while the overlay is on. */
export function noteColumnRender(day: number) {
  if (!isDebug() || !perfOverlay.get()) return;
  columns.renders++;
  columns.perDay.set(day, (columns.perDay.get(day) ?? 0) + 1);
}

/** The column renders so far (since the last reset) and how many days they were of. */
export function columnRenders() {
  return { renders: columns.renders, days: columns.perDay.size, seconds: Math.round((Date.now() - columns.since) / 1000) };
}

export function resetColumnRenders() {
  columns.renders = 0;
  columns.since = Date.now();
  columns.perDay.clear();
}

const onRender: ProfilerOnRenderCallback = (id, phase, actual, base) => {
  if (actual > SLOW_COMMIT_MS) console.log(`[perf] ${id} ${phase} ${actual.toFixed(1)} ms (without memo: ${base.toFixed(1)} ms)`);
};

/** `<Profiler>` in development builds that logs the commits of its children above 8 ms; nothing in other builds. */
export function PerfProfile({ id, children }: { id: string; children: ReactNode }) {
  if (!__DEV__) return <>{children}</>;
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}

let cacheLogged = false;

/** `JSON.stringify` for the query cache persister, timing it where `isDebug()`; logs the first write in dev. */
export function measuredSerialize(client: unknown): string {
  if (!isDebug()) return JSON.stringify(client);
  const t0 = performance.now();
  const out = JSON.stringify(client);
  const ms = performance.now() - t0;
  cacheStats.set((prev) => ({ bytes: out.length, ms, writes: (prev?.writes ?? 0) + 1 }));
  if (__DEV__ && !cacheLogged) {
    cacheLogged = true;
    console.log(`[perf] persisted query cache: ${(out.length / 1024).toFixed(0)} KB, JSON.stringify ${ms.toFixed(1)} ms`);
  }
  return out;
}
