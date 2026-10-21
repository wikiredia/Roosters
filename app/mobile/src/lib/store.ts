import { useSyncExternalStore } from 'react';

/** A tiny observable value for state outside React (session, network) that screens subscribe to. */
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const get = () => value;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const set = (next: T | ((prev: T) => T)) => {
    const v = typeof next === 'function' ? (next as (p: T) => T)(value) : next;
    if (Object.is(v, value)) return;
    value = v;
    listeners.forEach((l) => l());
  };
  const use = (): T => useSyncExternalStore(subscribe, get, get);
  return { get, set, subscribe, use };
}
