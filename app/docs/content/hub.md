---
title: Roosters+
position: 0
updated: 2026-10-30T15:40:00Z
---

**Roosters+** shows students their timetable straight from school and when their friends are free, so they
can take a break together. It's an Expo app (iOS and Android) on a Python backend in Docker, running on
this laptop now and on servers later. This page is the map: how the parts fit together and **where to look**
when you want to change something. Every file has its own page (the tree on the left), and the guides go
deeper per topic.

## The parts

```
  Phone (Expo app)                       This laptop (docker compose project "roostersplus")
 ┌────────────────────┐   HTTPS/JSON    ┌───────────────────────────────────────────────────────────┐
 │ mobile/src         │ ──────────────> │ api      :8000   FastAPI, every route under /api/v1        │
 │  screens (app/)    │   Bearer token  │ worker           jobs: login mails, timetable syncs, ...  │
 │  hooks (api/)      │   ETag, retries │ migrate          runs migrations once per deploy          │
 │  offline cache     │   Idempotency   │ db       MySQL   everything that lasts (internal network) │
 └────────────────────┘                 │ redis    Valkey  rate limits, locks, heartbeats            │
                                        │ admin    127.0.0.1:8090  admin API for the console        │
  Smart-Room console (:8443) ─────────> │ docs     127.0.0.1:8095  these docs (live, SQLite)        │
   Roosters+ tab                        │ mailpit  :8025   catches mail on the laptop               │
                                        └───────────────────────────────────────────────────────────┘
                                             │ worker fetches                     ▲
                                             ▼                                    │
                                      WebUntis (public class timetables), personal calendar links (.ics);
                                      the worker also hands push notifications to Expo's push service
```

| Part | What it does | Start reading |
| --- | --- | --- |
| **API** | Every request from the app: sign-in, your timetable, Today, friends, onboarding lists | `api/roosters/app.py` |
| **Worker** | Everything slow or retryable (mail, timetable syncs, push), from a job queue in MySQL | `api/roosters/worker.py`, `api/roosters/jobs.py` |
| **Database** | MySQL; the schema with comments is in the migrations | `api/roosters/migrations/0001_init.sql` |
| **Admin API** | Schools, users, jobs and tables for the management console (loopback only) | `api/roosters/admin.py` |
| **Docs service** | This documentation: live, with history, checked against the code | `docs/roostersdocs/app.py` |
| **App** | Screens (Expo Router), API hooks, offline cache, translations | `mobile/src/app/_layout.tsx`, `mobile/src/api/hooks.ts` |
| **Compose** | How it all runs (ports, networks, hardening) | `docker-compose.yml` |

## How a request travels

1. A screen calls a hook (`mobile/src/api/hooks.ts`), which calls `api.get/post/...` (`mobile/src/lib/api.ts`).
   That client adds the access token, a timeout, an ETag, and for writes an Idempotency-Key, then retries
   safely on bad school wifi.
2. The API (`api/roosters/app.py`): the idempotency middleware replays a retried write, then the route runs.
   `Depends(auth)` (`api/roosters/deps.py`) loads the user **through the session row**, so signing out
   or turning an account off works at once.
3. The route reads and writes MySQL with plain SQL (`api/roosters/db.py`), and queues slow work as a
   job (`api/roosters/jobs.py`).
4. Errors come back as `{code, message}` in the user's language (`api/roosters/errors.py`, `api/roosters/i18n.py`).
5. The app caches the answer on the phone (`mobile/src/lib/query.ts`): the next start shows it at once,
   even offline.

Timetables come **in** through the worker: `api/roosters/sync.py` fetches each followed Untis class
**once** (shared by every student in it) and each personal calendar link, detects changes, and
notifies the people affected.

## Where to look

| I want to … | Look at |
| --- | --- |
| Add or change an API route | the `r_*.py` file for the area (`r_me`, `r_friends`, `r_breaks`, `r_chat`, `r_schools`, `r_auth`); errors in `i18n.py` |
| Change sign-in, sessions, guests | `api/roosters/r_auth.py`, `tokens.py`, `providers.py`, `accounts.py`; the app's `mobile/src/app/welcome.tsx`, `login/` (`found.tsx`: 'you already had an account'), `mobile/src/lib/google.ts`, `lib/onboarding.routeAfterSignIn`; guide **Auth, sessions and guests** (Google client ids: **Running and operating**) |
| Change when two people 'share a break' | `api/roosters/logic.py` (pure functions, tested in `tests/test_logic.py`) |
| Change what friends can see | `api/roosters/friends.py`, `r_friends.py`, `schedule.py`; guide **Friends and privacy** |
| Change requests (break, access, skip questions, friend requests: cards in the chat, the Chat tab's 'Verzoeken') | `api/roosters/breaks.py`, `chat.py`, `r_friends.py`, migration `0016`; the app's `components/chat/RequestCard.tsx`, `app/(tabs)/chat.tsx`; guide **Friends and privacy** → 'Requests' |
| Change pinned friends (where they come first) | `api/roosters/friends.py` (`visible_friends`, `set_pinned`), `r_friends.edit_friend`, `r_me.today`, `mobile/src/lib/friends.ts`, `mobile/src/app/friends/` |
| Change how timetables are fetched | `api/roosters/sync.py`, `untis.py`, `ics.py`, `netfetch.py`; guide **Timetables** |
| Change a lesson's details (Type, Building, Floor, Classroom, ...: how they're found, renamed, merged) | `api/roosters/details.py`, `r_details.py`; the app's `mobile/src/lib/details.ts`, `app/onboarding/details.tsx`, `components/timetable/LessonSheet.tsx`; guide **Timetables** |
| Add a table or column | a new `api/roosters/migrations/NNNN_*.sql`; guide **Database** |
| Add a background job | `@jobs.handler` in the owning module, import it in `worker.py` |
| Add or change a screen | `mobile/src/app/` (file = route); texts in `mobile/src/i18n/nl.ts` + `en.ts` |
| Change onboarding or 'Complete the following steps' | `mobile/src/app/onboarding/`, `mobile/src/lib/onboarding.ts`, `mobile/src/components/SetupSteps.tsx` (the notifications step: `onboarding/notifications.tsx` + `lib/push.ts`) |
| Change semesters or the course list of the school year | `api/roosters/terms.py`, `sync.scan_courses`, `r_schools.courses`; guide **Timetables** |
| Change the calendar (Rooster tab) | `mobile/src/components/timetable/Calendar.tsx`, `DayGrid.tsx`, `DayStrip.tsx`; what's worked out per day: `DayCache.ts`; guide **Plan: a fast Rooster tab** |
| Change Vergelijken (you and friends side by side) or skip questions ("Volg je Python?") | `mobile/src/app/compare.tsx`, `components/timetable/CompareView.tsx`; API `skipasks.py`, `r_friends.ask_skip`, migration `0017` |
| Change the mini timetable of a break (who's there when) | `mobile/src/components/PeopleSheet.tsx` (`breakTarget`, `BreakPlan`), `lib/breaks.breakPlan` |
| Measure speed (fps, renders, cache size) | the fps overlay: Server & debug → Performance (`mobile/src/components/PerfOverlay.tsx`, `mobile/src/lib/perf.tsx`) |
| Change skipping a class (drag to the bin, summary, Undo) | `mobile/src/components/timetable/SkipDrag.tsx`, `SkipToast.tsx`, `mobile/src/lib/skips.ts`; API `r_me.skip`, `schedule.takes_place` |
| Change an e-mail (login code, welcome, new sign-in, account deleted) or add one | `api/roosters/mails.py` (texts + the shared HTML look, `nl` + `en`), `mailer.py` (the jobs that send them, the inline logo `mail_assets/logo.png`); preview in Mailpit (`:8025`) |
| Change push notifications (texts, who gets what, Meldingen) | `api/roosters/push.py`, `notifications.py`, `mobile/src/lib/push.ts`, `mobile/src/app/settings/notifications.tsx` |
| Change profile photos | `api/roosters/r_me.py` (`put_photo`), `r_friends.photo`, `mobile/src/lib/photo.ts`, `components/ui/Bits.tsx` (`Avatar`) |
| Change a design token or component | `mobile/src/global.css`, `mobile/src/components/ui/` |
| Add something to the management console | `api/roosters/admin.py` (+ the console's `roosters.js`); guide **Management console and docs** |
| Change settings or secrets | `api/roosters/config.py`, `.env.example` |
| Find an endpoint | **API routes & jobs** (left): every route with its file and line |

## Rules that hold everywhere

- **Bad wifi is the normal case.** Timeouts, safe retries, idempotent writes, ETags, an offline cache,
  and a small banner instead of error screens.
- **Privacy by default.** No teachers or free text from Untis; calendar links encrypted; friends see only
  what you allow; guests are invisible to others; accounts are deleted for real.
- **Times** are minutes since midnight in the school's timezone; `DATETIME` columns are UTC.
- **Every change comes with its docs**: see `docs/README.md`. Stale or missing docs show up in **To-do**.

## Guides

The guides on the left go deeper: auth and guests, timetables, friends and privacy, the database, the app,
operations, releasing to TestFlight and Play (HTTPS with Caddy for the API, the website on roostersplus.be and the
old server, EAS, Apple and Google accounts), security, the
management console, and recipes for common changes.
