# Roosters+ (v2)

The full app: iOS + Android (Expo / React Native) on top of a backend that can grow from your laptop
to several servers. The existing versions (`site/`, `server/`, `desktop/`) stay as they are.

```
app/
  api/            Python backend (FastAPI): API + worker, same Docker image
  mobile/         Expo app (iOS + Android; the web build is only for testing)
  docs/           Docs service: live architecture docs (hub, guides, every file and function), content/ in git
  design/         The Claude Design prompt and its result (claude-design/: boards, tokens.css, ui.css)
  infra/          Server pieces (toxiproxy for "school wifi"; Caddy for production later)
  docker-compose.yml        Everything on your laptop
  docker-compose.test.yml   Only MySQL + Valkey, for running the tests
```

## Decisions

| What | Choice |
| --- | --- |
| Name | **Roosters+** (`Roostersplus` where `+` isn't allowed) |
| App | Expo (React Native), Expo Router, TypeScript |
| Components | React Native Reusables (shadcn/ui for React Native): we own the code, restyled with our own tokens |
| Fonts | Atkinson Hyperlegible Next (text, tabular figures for times) + Bricolage Grotesque (headings) |
| Colors | From the app icon: navy `#161F2A`, blue `#2E5BFF` (you), rose `#F0487A` (friends), yellow `#FFC21A` (together) |
| Target group | Higher education, starting at AP Hogeschool |
| Languages | Dutch + English |
| Premium | €2.99/month or €19.99/year; the core (schedule, friends, breaks, chat) stays free |
| Backend | Python 3.12, FastAPI, MySQL 8.4, Valkey (Redis), Docker |
| Hosting | Laptop now, Hetzner later |

## Run it on your laptop

Needs Docker Desktop (Mac/Windows) or Docker Engine (Linux).

```bash
cd app
cp .env.example .env
docker compose up --build
```

| | |
| --- | --- |
| API docs (try every endpoint) | http://localhost:8000/api/docs |
| Mails (login codes) | http://localhost:8025 |
| Admin API (console only) | http://127.0.0.1:8090/admin/v1 (`ADMIN_TOKEN` in `.env`) |
| Docs service | http://127.0.0.1:8095/docs/v1/hub (`DOCS_TOKEN` in `.env` to edit) |
| From your phone (same wifi) | `http://<your-laptop-ip>:8000` (Mac: `ipconfig getifaddr en0`) |

Add AP (once): the worker then fetches its class list from Untis. Easiest from the Smart-Room console:
**Roosters+ → Schools & classes → + Add school** (search Untis by name). Or from a terminal:

```bash
docker compose exec api python -m roosters.cli add-school ap "AP Hogeschool" --short AP --untis ap.webuntis.com --login ap
docker compose exec api python -m roosters.cli add-campus ap "Spoor Noord"
docker compose exec api python -m roosters.cli schools
```

Code changes in `api/roosters/` are picked up by the API automatically (`--reload`); restart the worker
with `docker compose restart worker`. Start over with an empty database: `docker compose down -v`.

**Update and restart in one go** (from the repo root): `./server-restart.sh` pulls (fast-forward only), rebuilds and
restarts every service (new migrations run when the API starts), waits until the API answers, runs `npm ci` when
the app's dependencies changed, and starts Expo with a clean cache pointing at `http://94.226.242.154:8010`.
Another address: `API_URL=http://<ip>:<port> ./server-restart.sh`; without Expo: `./server-restart.sh --no-expo`.

### The app

Needs Node 20+. On your phone: install **Expo Go** (App Store / Play Store), same wifi as your laptop.

```bash
cd app/mobile
npm install
npx expo start          # scan the QR code with your camera (iPhone) or Expo Go (Android)
npx expo start --web    # or in the browser (needs CORS_ORIGINS=* in app/.env)
```

The app finds the API on port 8000 of the computer that runs `expo start`. Somewhere else:
`EXPO_PUBLIC_API_URL=http://192.168.1.20:8000 npx expo start -c` (`-c`: these variables are baked in
when Metro builds, so clear its cache after changing them). Sign in with any e-mail address;
the code shows up in Mailpit (http://localhost:8025).

### Sign-in or mail doesn't work

"That didn't work. Check your connection" when sending a code almost always means the app doesn't
reach the API, so no mail is sent at all.

1. **In the app:** development builds have a **Server & debug** screen (top right on the welcome screen,
   under the error on the e-mail screen, and in Ik). It shows which address the app uses, lets you
   change it without rebuilding, tests the connection, asks the server about the mail setup and sends
   a test mail. It also lists the app's last requests with what came back.
2. **Port 8000 already taken** on that machine: set `API_PORT=8010` in `.env`, `docker compose up -d`,
   then point the app at it: `EXPO_PUBLIC_API_PORT=8010 npx expo start -c` (or set the address on
   the debug screen).
3. **On the server:**

   ```bash
   docker compose exec api python -m roosters.cli debug                  # mail settings, SMTP reachable?, worker running?, last login mails + hints
   docker compose exec api python -m roosters.cli test-mail you@example.com  # sends right away, shows the SMTP error
   docker compose logs -f api worker   # "login code … queued as job N", then "mail … handed to mailpit:1025"
   ```

   With `ENV=dev` the worker also logs the code itself (`DEV login code for …`), so you can sign in
   while you fix the mail. `GET /api/v1/debug` gives the same report as the `debug` command; both
   debug endpoints answer 404 unless `ENV=dev`.

Sign in with Apple only works in a development build (`npx expo run:ios`), not in Expo Go.

### Feel the school wifi

```bash
docker compose --profile slow up -d
./slow-wifi.sh on      # 800 ms ± 400 delay, ~50 KB/s, chopped-up packets
./slow-wifi.sh awful   # 2 s delay, ~10 KB/s, 15% of connections cut halfway
./slow-wifi.sh off
```

Point the app at port **8001** instead of 8000 to go through it. Also try airplane mode on and off
while sending something: nothing may get lost or arrive twice.

## Tests

```bash
cd app
docker compose -f docker-compose.test.yml up -d
cd api
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt ruff
ruff check roosters tests && pytest
```

They run against a real MySQL and Valkey (also in GitHub Actions, on every change in `app/api/`).

## How the backend works

- **Accounts:** sign in with a 6-digit code by e-mail, Sign in with Apple or Google. No passwords.
  Or don't sign in yet: a **guest** account (own timetable yes, friends after confirming an e-mail); signing
  in later keeps everything. Every onboarding step can be skipped; Today lists what's left.
  The app gets a short access token (15 min) and a refresh token that changes on every use; a stolen
  old refresh token ends the session. "Log out everywhere" and deleting your account work immediately.
- **One fetch per class:** if 200 students follow class 2ITCSC1a, Untis is asked once, not 200 times.
  Requests to one Untis server are spaced out across all workers. Each student's course filter
  (include/exclude) is applied when reading. Personal calendar links (Google/iCloud/Outlook) per person.
- **Only what's needed:** no teachers, no free text from Untis; calendar links encrypted.
- **Friends:** invite link (`/i/<code>`) or a request within your school. Each friend sees your full
  timetable or only free/busy (your choice per friend); ghost mode hides you for a while; blocking is silent.
- **Built for bad wifi:** `GET /api/v1/me/today` gives the whole Today screen in one request, with an
  ETag (nothing changed → empty 304). Writes accept an `Idempotency-Key` header: a retry after a lost
  answer gets the same answer instead of running twice. Rate limits per account, not per IP (a whole
  school shares one IP).
- **Ready for more servers:** the API keeps nothing in memory (rate limits and locks in Valkey);
  background work is a job queue in MySQL (`SELECT … FOR UPDATE SKIP LOCKED`), so you can run as
  many workers as you like; only one schedules at a time. Migrations run once per deploy (`migrate`
  service), never at API start.
- **Errors** come back as `{"code": "...", "message": "..."}`, the message in Dutch or English.

### Endpoints (v1)

| Area | Endpoints |
| --- | --- |
| Sign in | `POST /api/v1/auth/guest`, `/email/start`, `/email/verify`, `/apple`, `/google`, `/refresh`, `/logout`, `/logout-all`, `GET /auth/sessions` |
| Me | `GET/PATCH/DELETE /api/v1/me`, `PUT /me/ghost`, `GET /me/export` |
| Timetable | `GET /me/sources`, `POST /me/sources/untis`, `POST /me/sources/ics`, `PATCH/DELETE /me/sources/{id}`, `POST /me/refresh`, `PUT /me/hidden-courses`, `GET /me/schedule` |
| Today | `GET /me/today`, `PUT /me/checkin`, `GET /me/notifications`, `POST /me/notifications/read` |
| Schools | `GET /api/v1/schools`, `/schools/{id}/campuses`, `/schools/{id}/classes`, `/schools/{id}/classes/{id}/courses` |
| Debug (ENV=dev only) | `GET /api/v1/debug`, `POST /debug/mail`; signed in, for your own account and test people: `GET /debug/users`, `POST /debug/login`, `POST/DELETE /debug/test-users`, `DELETE /debug/users/{id}`, `POST /debug/users/{id}/timetable`, `POST /debug/test-chats`, `PUT /debug/friends/{id}` |
| Breaks | `GET/POST /api/v1/breaks`, `POST /breaks/{id}/respond\|counter\|cancel` |
| Chat | `GET/POST /api/v1/chats`, `POST /chats/direct`, `GET/PATCH /chats/{id}`, `POST /chats/{id}/members`, `DELETE /chats/{id}/members/me`, `GET/POST /chats/{id}/messages`, `DELETE /chats/{id}/messages/{id}`, `POST /chats/{id}/read`, `POST /chats/messages/{id}/report`; admin: `GET /admin/v1/reports`, `POST /admin/v1/reports/{id}` |
| Friends | `GET /api/v1/friends`, `PATCH/DELETE /friends/{id}`, `GET/POST /friends/requests`, `POST /friends/requests/{id}/accept\|decline\|cancel`, `POST /invites`, `GET /invites/{code}`, `POST /invites/{code}/accept`, `GET/POST /blocks`, `DELETE /blocks/{id}`, `GET /friends/{id}/schedule`, `GET /compare` |

The OpenAPI schema (`/api/openapi.json`) is always on. The app's types live in `mobile/src/api/types.ts`.
Every route with its file and a description: the docs (console → Roosters+ → Documentation → API routes & jobs).

## Management console and docs

The Smart-Room console (port 8443) has a **Roosters+** tab: the documentation hub (architecture, guides,
every file and function, editable live with history), overview and health, schools/campuses/classes,
users, background jobs, a read-only database browser and the activity log. It talks to two services that
listen on this laptop only: the admin API (`api/roosters/admin.py`, `ADMIN_TOKEN`) and the docs service
(`docs/`, `DOCS_TOKEN`). Changing code? Update its docs in the same change: `docs/README.md`.

## Next

1. ~~Break requests ("Pauze samen?")~~ (done: `api/roosters/breaks.py`, `mobile/src/components/BreakSheet.tsx`),
   ~~"Voor jou"~~ (done: Today), ~~chat with moderation~~ (done: `api/roosters/chat.py`, `mobile/src/app/chat/`;
   reported messages are in the admin API, not yet in the console tab), ~~push notifications (Expo Push) and their
   settings (push per chat too)~~ (done: `api/roosters/push.py`, `mobile/src/lib/push.ts`, Ik → Meldingen; needs an
   EAS project id and a development build; "a friend is free" and "travelling together" pushes still to come),
   ~~skipping one lesson ("Vak overslaan")~~ (done: `r_me.skip`, `mobile/src/components/timetable/SkipDrag.tsx`)
2. In the app after that: Google Sign-In (needs client IDs), QR codes, pinned friends, ~~the notifications step in onboarding~~
   (done: `mobile/src/app/onboarding/notifications.tsx`, last step, and on Today's steps until the phone was asked)
3. Premium (RevenueCat), widgets
4. Server: Caddy (HTTPS, HTTP/3) + backups + monitoring on Hetzner
