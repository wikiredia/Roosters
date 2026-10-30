---
updated: 2026-10-30T09:31:00Z
---

**Offline first.** TanStack Query with a persister: everything the app showed is kept on the phone
(AsyncStorage, 7 days) and shown at once on the next start, then refreshed in the background. No screen
waits on the network to show something.

## `persister`

Saves the cache to AsyncStorage (`rp:query-cache`), at most every 5 s (`throttleTime`), through `lib/perf.measuredSerialize`
(which also records the size and time of each write for the fps overlay). Every write is a `JSON.stringify` of the whole
persisted cache on the JS thread, which is why `shouldPersist` keeps it small. Bump `buster` in `app/_layout.tsx` when cached shapes change.

## `shouldPersist`

`dehydrateOptions.shouldDehydrateQuery`: what is written. Only what a cold start shows at once: me, today, friends and their
requests, your breaks, the chat list, your sources, how you show lesson details (the lesson sheet offline), and the schedule weeks from one before this week to three after it. Not
a chat's messages, friends' schedules, comparisons, the onboarding lists, or schedule weeks you scrolled to far away: those stay
in memory and load again when opened. Queries that aren't successful are left out, as before.

## `queryClient`

30 s stale time, offline-first network mode, no retries for 4xx (the API client already retried network errors).

## `startFocusWatch`

Refetch when the app comes back to the foreground.
