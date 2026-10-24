---
updated: 2026-10-24T13:20:00Z
---

**Me**: profile, Premium (soon), ghost mode, friends, timetable sources, notifications (Meldingen: `settings/notifications.tsx`; the row says "2 van 3 aan · stil 22:00–07:30", or that this phone doesn't get them), language, privacy, download your data, sign out (one row that opens a sheet: on this phone, or on every device, both red), delete account. Development builds also get **Server & debug** (`debug.tsx`) and **Test data & users**
(`dev.tsx`). **Guests** see 'Confirm your e-mail' at the top of the account section; signing out a guest asks first (there's no way back in), and signs out right away (no sheet: 'everywhere' means nothing for a guest).

## `Choice`, `GhostSheet`

Hide for an hour / until midnight / until you turn it off.

## `IkScreen`

The tab.

## `LEGAL_URL`

Terms and privacy link (`EXPO_PUBLIC_LEGAL_URL`).

## `T`

Type of `t()`.

## `pushSummary`

The Meldingen row's line: how many categories are on and the quiet hours, or "Uit op deze telefoon" when the phone
hasn't allowed notifications (`lib/push.pushState`).

## `agoLabel`

'just now', '4 min ago', …

## `ghostUntil`, `ghostLabel`

When ghost mode ends, and how to say it.
