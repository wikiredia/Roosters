---
updated: 2026-10-24T02:00:00Z
---

All settings, read **once at import** from environment variables (compose passes `app/.env`).
`.env.example` documents each one for people; this file documents them for code.

- Changing a value means restarting the service (`docker compose up -d api worker admin`).
- `SECRET_KEY` derives every key (`crypto.derived_key`): changing it signs everyone out, invalidates
  login codes and makes stored calendar links unreadable.
- `DEV` (ENV=dev) turns on `/api/docs`, the `/api/v1/debug` routes and login codes in the worker log.
  **Never on a real server.**

## `ACCESS_TTL`, `REFRESH_TTL_DAYS`, `LOGIN_CODE_TTL`, `LOGIN_CODE_ATTEMPTS`

Sessions: a 15-minute access token, a refresh token valid for 180 days of inactivity (`tokens.py`), and login codes valid for 10 minutes with 5 tries.

## `ADMIN_TOKEN`

Bearer token for the admin API (`admin.py`). Empty or too short: the admin API refuses everything.

## `APPLE_CLIENT_IDS`, `GOOGLE_CLIENT_IDS`

Accepted audiences of Apple/Google ID tokens (`providers.py`). Empty: that sign-in method answers `provider_unavailable`.

## `CORS_ORIGINS`

Browser origins allowed to call the API (the web build on the laptop). The native app needs none.

## `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_POOL`

MySQL connection. `DB_POOL` is how many idle connections each process keeps (`db.py`).

## `ENV`, `DEV`

`dev` on the laptop, `prod` on a server. `DEV` gates the debug features (see above).

## `MAIL_MODE`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_STARTTLS`

Mail (`mailer.py`): `smtp` sends through Mailpit on the laptop or a real provider in production; `console` only logs.

## `MAX_FRIENDS`, `MAX_COMPARE_FREE`

Limits: 300 friends; Compare with up to 3 friends for free (more is a planned Premium feature; `r_friends.compare` answers 402).

## `PUBLIC_URL`

Where the API is reachable from phones. Used in invite links (`<PUBLIC_URL>/i/<code>`).

## `REDIS_URL`

Valkey/Redis for rate limits, locks, the Untis throttle and the worker heartbeat (`redisx.py`, `debug.py`).

## `SECRET_KEY`

At least 32 characters. The root of all keys (`crypto.py`); see the warning above.

## `SYNC_EVERY_DAY`, `SYNC_EVERY_NIGHT`, `REFRESH_COOLDOWN`, `UNTIS_MIN_INTERVAL`, `WEEKS_AHEAD`

Timetable sync (`sync.queue_due`): every 120 minutes from 06:00 to 22:00, every 480 at night. A user can refresh manually once per 90 seconds. Requests to one Untis server are spaced 1 second apart across all workers. Three weeks are fetched ahead.

## `KEEP_PAST_DAYS`, `WEEK_STALE_HOURS`, `WEEKS_MAX_DISTANCE`

Scrolling through the timetable: class lessons are kept 400 days; a future week fetched on demand is
fetched again after 24 h; you can look up to 104 weeks back or ahead (`schedule.ensure_weeks`).

## `SCAN_MAX_WEEKS`, `COURSES_RESCAN_DAYS`

The course scan of a whole school year (`sync.scan_courses`): at most 53 weeks, made again when it's older than 7 days (asked for by onboarding via `r_schools.courses`).

## `TZ`

Fallback timezone for a user without a school. A school's own `tz` column is used whenever possible (`sync.tz_of`).

## `_list`

Comma-separated environment variable to a list of non-empty strings.
