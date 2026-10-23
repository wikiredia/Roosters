---
updated: 2026-10-23T17:30:00Z
---

**Offline first.** TanStack Query with a persister: everything the app showed is kept on the phone
(AsyncStorage, 7 days) and shown at once on the next start, then refreshed in the background. No screen
waits on the network to show something.

## `persister`

Saves the cache to AsyncStorage (`rp:query-cache`), throttled. Bump `buster` in `app/_layout.tsx` when cached shapes change.

## `queryClient`

30 s stale time, offline-first network mode, no retries for 4xx (the API client already retried network errors).

## `startFocusWatch`

Refetch when the app comes back to the foreground.
