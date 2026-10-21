import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { ApiError } from './api';

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
  throttleTime: 2000,
});

/** Refresh when the app comes back to the foreground. */
export function startFocusWatch() {
  if (Platform.OS === 'web') return;
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (s) => handleFocus(s === 'active'));
    return () => sub.remove();
  });
}
