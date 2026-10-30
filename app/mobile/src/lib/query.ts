import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, focusManager, QueryClient, type Query } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { ApiError } from './api';
import { measuredSerialize } from './perf';
import { addDays, isoDay, monday } from './time';

/**
 * Offline first: everything the app showed is kept on the phone (AsyncStorage) and shown instantly
 * on the next start, then refreshed in the background. No screen waits on the network to show something.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 60 * 60_000,
      networkMode: 'offlineFirst',
      // The API client already retried network errors; don't retry "no"s from the server
      retry: (count, err) => count < 1 && !(err instanceof ApiError && err.status < 500),
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: (count, err) => count < 2 && !(err instanceof ApiError && err.status < 500),
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'rp:query-cache',
  // Every write is a JSON.stringify of the whole cache on the JS thread: not more often than this
  throttleTime: 5000,
  serialize: measuredSerialize,
});

/** The queries a cold start shows at once: you, Today, friends and their requests, your breaks, the chat list, your
 * sources and how you show a lesson's details (the lesson sheet, offline too). Not the chats' messages, friends' schedules, comparisons or the onboarding lists: they load when opened. */
const PERSISTED = new Set(['me', 'today', 'friends', 'requests', 'breaks', 'chats', 'sources', 'details']);
/** Of the schedule, the weeks from this many before this week to this many after it (the Rooster tab's first screens). */
const WEEKS_BACK = 1;
const WEEKS_AHEAD = 3;

/** `dehydrateOptions.shouldDehydrateQuery` of the persister: what goes into the saved cache (the rest stays in memory). */
export function shouldPersist(query: Query) {
  if (!defaultShouldDehydrateQuery(query)) return false;
  const [kind, week] = query.queryKey;
  if (PERSISTED.has(String(kind))) return true;
  if (kind !== 'schedule' || typeof week !== 'string') return false;
  const thisWeek = monday(new Date());
  return week >= isoDay(addDays(thisWeek, -7 * WEEKS_BACK)) && week <= isoDay(addDays(thisWeek, 7 * WEEKS_AHEAD));
}

/** Refresh when the app comes back to the foreground. */
export function startFocusWatch() {
  if (Platform.OS === 'web') return;
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (s) => handleFocus(s === 'active'));
    return () => sub.remove();
  });
}
