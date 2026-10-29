import { useCallback, useInsertionEffect, useRef } from 'react';

/**
 * A ref that always holds the newest value, for callbacks that must keep one identity (memoised children,
 * gestures) but read current state when they run. It is updated in an insertion effect: before any layout effect
 * and event of the commit, never during render.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useInsertionEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * A function with one identity for the whole life of the component that calls the newest `fn`. Give it to a
 * memoised child, or to a gesture that hands it to `scheduleOnRN`: a new callback on every render would make the
 * memo (and the memoised gesture) useless.
 */
export function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useLatest(fn);
  return useCallback((...args: A) => ref.current(...args), [ref]);
}
