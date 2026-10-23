---
title: The mobile app
position: 60
updated: 2026-10-23T17:30:00Z
---

Expo (React Native) with Expo Router: **a file in `mobile/src/app/` is a screen**.

| Folder | What |
| --- | --- |
| `app/` | Screens: `index.tsx` (the gate), `welcome`, `login/`, `onboarding/`, `(tabs)/` (Today, Rooster, Chat, Me), `friends/`, `settings/`, `i/[code]` (invite links), `compare`, `debug` |
| `api/` | `hooks.ts` (every call as a TanStack Query hook) and `types.ts` (answer shapes) |
| `lib/` | `api.ts` (the client for bad wifi), `session.ts`, `onboarding.ts`, `query.ts` (offline cache), `net.ts`, `server.ts`, `time.ts` |
| `components/` | `ui/` (the design system), `timetable/`, `SetupSteps`, `VerifyFirst`, `InviteCard` |
| `i18n/` | `nl.ts` (source of truth for keys) and `en.ts` |

## Starting up

`app/_layout.tsx` loads fonts, server address, session and language, then `app/index.tsx` decides: welcome,
the first unfinished onboarding step, or Today (always Today once onboarding was finished **or skipped**).

## Onboarding you can race through

Welcome → (e-mail → code, or **continue without signing in**) → school → campus → classes → courses → week
→ friends. Every step has **Skip**. What's skipped shows on Today as **Complete the following steps**
(`components/SetupSteps.tsx`): confirm your e-mail, choose your school, add your timetable, add friends.

## Data and offline

Every answer is cached on the phone (`lib/query.ts`) and shown at once on the next start. The client
(`lib/api.ts`) handles timeouts, retries, ETags, idempotency and the school wifi login page. The network
banner (`components/ui/NetBanner.tsx`) explains stale data instead of showing error screens.

## Checks

CI: `npx tsc --noEmit`, `npx expo-doctor`, `npx expo export --platform web`. Lint with `npx expo lint`.
