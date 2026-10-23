---
updated: 2026-10-23T17:30:00Z
---

**The whole Roosters+ stack** (compose project `roostersplus`): `cd app && cp .env.example .env &&
docker compose up --build`. The same images run on a server later; only `.env` and the reverse proxy differ.

Hardening on every service (`x-hardening`): restart unless stopped, no-new-privileges, capped logs. The app
services (`x-app`: api, worker, admin, migrate) also run read-only with all capabilities dropped.

Networks: `backend` (internal: database and Redis have no internet and no published ports), `egress`
(Untis and calendar links), `frontend` (published ports).

| Port | What |
| --- | --- |
| 8000 | the public API (phones) |
| 127.0.0.1:8090 | admin API (management console only) |
| 127.0.0.1:8095 | docs service |
| 8025 | Mailpit (every mail the laptop sends) |
| 8001 | the API through 'school wifi' (profile `slow`) |

## `admin`

The admin API for the console, on 127.0.0.1 only (`ADMIN_PORT`, default 8090).

## `api`

The public API on port 8000 (`API_PORT`). On the laptop: `--reload` and the code mounted read-only.

## `db`

MySQL 8.4 with utf8mb4, no name resolution, X Protocol off; data in the `db` volume. `docker compose down -v` starts over with an empty database.

## `docs`

The docs service (`app/docs`): the code mounted read-only **piece by piece** (so `.env` never enters the container), SQLite in the `docs` volume, 127.0.0.1 only (`DOCS_PORT`, default 8095).

## `mailpit`

Catches every mail on the laptop: http://localhost:8025.

## `migrate`

Runs the migrations once and exits; api, worker and admin wait until it succeeded.

## `redis`

Valkey (the open-source continuation of Redis), without persistence: it only holds counters, locks and heartbeats.

## `toxiproxy`

'School wifi' in front of the API (profile `slow`, port 8001); `slow-wifi.sh` sets how bad.

## `worker`

Background jobs and the scheduler (`roosters.worker`).
