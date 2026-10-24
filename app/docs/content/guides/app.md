---
title: The mobile app
position: 60
updated: 2026-10-24T11:01:00Z
---

Expo (React Native) with Expo Router: **a file in `mobile/src/app/` is a screen**.

| Folder | What |
| --- | --- |
| `app/` | Screens: `index.tsx` (the gate), `welcome`, `login/`, `onboarding/`, `(tabs)/` (Today, Rooster, Chat, Me), `chat/` (a conversation, a new group), `friends/`, `settings/`, `i/[code]` (invite links), `compare`, `debug` |
| `api/` | `hooks.ts` (every call as a TanStack Query hook) and `types.ts` (answer shapes) |
| `lib/` | `api.ts` (the client for bad wifi), `session.ts`, `onboarding.ts`, `query.ts` (offline cache), `net.ts`, `server.ts`, `time.ts` |
| `components/` | `ui/` (the design system; `ui/Motion.tsx` has the shared springs and press animation), `timetable/`, `onboarding/` (course previews), `SetupSteps`, `VerifyFirst`, `InviteCard` |
| `i18n/` | `nl.ts` (source of truth for keys) and `en.ts` |

## Starting up

`app/_layout.tsx` loads fonts, server address, session and language, then `app/index.tsx` decides: welcome,
the first unfinished onboarding step, or Today (always Today once onboarding was finished **or skipped**).

## Onboarding you can race through

Welcome → (e-mail → code, or **continue without signing in**) → school → campus → classes → courses → week
→ friends. Classes are picked **per semester** (S1 and S2 sections on one screen), and courses per semester
from the **whole school year**, nothing chosen until you choose it, with a preview of the timetable you'll get
('Ik volg dit vak niet', 'Ik mis een les') before saving (`onboarding/classes.tsx`, `onboarding/courses.tsx`,
`components/onboarding/CoursePreview.tsx`). Every step has **Skip**. What's skipped shows on Today as **Complete the following steps**
(`components/SetupSteps.tsx`): confirm your e-mail, choose your school, add your timetable, add friends.

## The Rooster tab

1–7 days side by side, one continuous strip you scroll through day by day (`components/timetable/DayGrid.tsx`),
mirrored by the week strip above (`DayStrip.tsx`): they share the same animated values, so they move together.
Drag the strip's dash, pinch or − / + for more or fewer days; double tap to zoom the hours; 'Vandaag' floats over
the grid (`TodayPill.tsx`). Day math and where a swipe lands: `lib/days.ts`. Data comes a week at a time
(`useWeeks`); every lesson kind has its own colour.

## Data and offline

Every answer is cached on the phone (`lib/query.ts`) and shown at once on the next start. The client
(`lib/api.ts`) handles timeouts, retries, ETags, idempotency and the school wifi login page. The network
banner (`components/ui/NetBanner.tsx`) explains stale data instead of showing error screens.

## Checks

CI: `npx tsc --noEmit`, `npx expo-doctor`, `npx expo export --platform web`. Lint with `npx expo lint`.
