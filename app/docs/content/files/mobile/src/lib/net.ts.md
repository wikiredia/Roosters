---
updated: 2026-10-23T17:30:00Z
---

What the network looks like **from the app**, for the banner on every screen (`components/ui/NetBanner.tsx`): `offline` (no connection), `captive` (school wifi shows its login page), `blocked` (internet works but our requests keep failing: firewall, TLS inspection).

## `NetState`, `netState`

The state and its store.

## `reportResult`

Called by the API client after every request; three failures in a row while the phone says it's online means `blocked`.

## `startNetworkWatch`

Follows the phone's connection (NetInfo) and lets React Query pause and resume with it.
