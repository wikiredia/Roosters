import type { Friend } from '@/api/types';

/** The order of friends everywhere, the same as the API's: the ones you pinned first, then by name. A new list. */
export function pinnedFirst<F extends Pick<Friend, 'pinned' | 'display_name'>>(list: F[]): F[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.display_name.localeCompare(b.display_name));
}

/** Pinned ones first, otherwise the order stays (Today's board: then whoever is free first). A new list. */
export function pinnedOnTop<T>(list: T[], isPinned: (x: T) => boolean): T[] {
  return [...list].sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)));
}
