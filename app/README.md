# Roosters+ (v2)

The full app: iOS + Android (Expo / React Native) on top of a backend that can grow from your laptop
to several servers. The existing versions (`site/`, `server/`, `desktop/`) stay as they are.

```
app/
  api/            Python backend (FastAPI): API + worker, same Docker image
  mobile/         Expo app (coming after the designs are done)
  design/         The prompt for Claude Design, later the design tokens
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
| From your phone (same wifi) | `http://<your-laptop-ip>:8000` (Mac: `ipconfig getifaddr en0`) |

Add AP (once): the worker then fetches its class list from Untis.

```bash
docker compose exec api python -m roosters.cli add-school ap "AP Hogeschool" --short AP --untis ap.webuntis.com --login ap
docker compose exec api python -m roosters.cli add-campus ap "Spoor Noord"
docker compose exec api python -m roosters.cli schools
```

Code changes in `api/roosters/` are picked up by the API automatically (`--reload`); restart the worker
with `docker compose restart worker`. Start over with an empty database: `docker compose down -v`.

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
| Sign in | `POST /api/v1/auth/email/start`, `/email/verify`, `/apple`, `/google`, `/refresh`, `/logout`, `/logout-all`, `GET /auth/sessions` |
| Me | `GET/PATCH/DELETE /api/v1/me`, `PUT /me/ghost`, `GET /me/export` |
| Timetable | `GET /me/sources`, `POST /me/sources/untis`, `POST /me/sources/ics`, `PATCH/DELETE /me/sources/{id}`, `POST /me/refresh`, `PUT /me/hidden-courses`, `GET /me/schedule` |
| Today | `GET /me/today`, `PUT /me/checkin`, `GET /me/notifications`, `POST /me/notifications/read` |
| Schools | `GET /api/v1/schools`, `/schools/{id}/campuses`, `/schools/{id}/classes`, `/schools/{id}/classes/{id}/courses` |
| Friends | `GET /api/v1/friends`, `PATCH/DELETE /friends/{id}`, `GET/POST /friends/requests`, `POST /friends/requests/{id}/accept\|decline\|cancel`, `POST /invites`, `GET /invites/{code}`, `POST /invites/{code}/accept`, `GET/POST /blocks`, `DELETE /blocks/{id}`, `GET /friends/{id}/schedule`, `GET /compare` |

The OpenAPI schema (`/api/openapi.json`) is always on: the app generates its typed client from it.

## Next

1. Break requests ("Pauze samen?"), chat with moderation (report/block, required by the stores), push notifications (Expo Push)
2. The Expo app, built on the Claude Design result
3. Premium (RevenueCat), widgets
4. Server: Caddy (HTTPS, HTTP/3) + backups + monitoring on Hetzner
