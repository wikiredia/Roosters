---
updated: 2026-10-24T00:30:00Z
---

The **admin API** for the management console (Smart-Room console → Roosters+ tab). It is a separate
FastAPI app (`roosters.admin:app`, compose service `admin`), published on **127.0.0.1:8090 only**, so it
can't be reached from the network.

- **Auth:** every `/admin/v1/*` route needs `Authorization: Bearer <ADMIN_TOKEN>` (`config.ADMIN_TOKEN`,
  32+ characters, from `app/.env`). Without a token configured, everything answers 503 `admin_off`.
  The console reads the token from `.env` and adds it, so the browser never sees it.
- **Audit:** the console sends `X-Admin-Actor: <device name>`; every change is written to the
  `admin_log` table through `record` (Activity in the console).
- **What it manages:** overview counts and health, schools / campuses / classes (with Untis search),
  users (search, edit, turn off, sign out, delete), background jobs, a read-only browser for every
  table, a test mail, and the activity log.
- **Safety:** the table browser is read-only and masks secret columns (`SECRET_COLUMNS`). Writes go
  through curated endpoints that keep data consistent (e.g. deleting a school removes its classes and
  lessons; deleting a campus resets users' campus). Job payloads hide login codes and addresses.

The console side is `smart-room/backend/roomctl/console/roosters.py` (the proxy) and
`smart-room/console/web/js/roosters.js` (the UI). Tests: `api/tests/test_admin.py`.

## `CampusIn`, `add_campus`, `rename_campus`, `delete_campus`

Campuses of a school. Deleting one sets `campus_id` to NULL for the users on it (they keep their school). Campus matters for breaks: same-campus breaks count from 30 minutes, see `logic.min_break`.

## `ClassPatch`, `edit_class`

Show or hide a class in onboarding (`active`). The class-list refresh in `sync.refresh_classes` turns classes Untis no longer lists off, and turns them back on when they reappear.

## `SECRET_COLUMNS`

Columns the table browser never shows (shown as •••): refresh-token and login-code hashes, encrypted calendar links (`secret_enc`), stored idempotent answers (`body`).

## `SLUG_RE`

A school slug: lowercase letters, digits and dashes, starting with a letter or digit, at most 60 characters. Used in URLs and CLI commands (`add-school ap ...`).

## `SchoolIn`, `SchoolPatch`, `_check_school_fields`

Input for adding and editing a school. `_check_school_fields` validates the timezone (a real IANA zone), the Untis server (must be `*.webuntis.com`, see `untis.check_server`), and upper-cases the country. The semester dates `year_start`, `s2_start`, `year_end` are `MM-DD` (default `09-01`, `02-01`, `07-15`, see `terms.py`) and must be real days.

## `TestMailIn`, `test_mail`

`POST /admin/v1/mail/test`: send a mail directly (not through the worker), so an SMTP error comes back in the answer (`debug.send_test_mail`).

## `USER_COLS`, `_user_out`

The user columns the console shows, plus computed last seen, friend count and timetable count.

## `UserPatch`, `edit_user`

`PATCH /admin/v1/users/{id}`: rename, change school or campus, or turn the account off or on.
- **disabled: true** sets `users.disabled_at` and revokes every session. `deps.auth` refuses disabled
  users at once, and `r_auth._existing` refuses them at sign-in (403 `account_disabled`).
- Changing school resets the campus (it belongs to the old school).

## `_school_out`, `SCHOOL_SQL`

A school with live counts: active classes, classes with sync errors, and users.

## `_tables`, `tables`

`GET /admin/v1/tables`: every table with its row count and columns (`SHOW TABLES` / `SHOW COLUMNS`).

## `_ts`, `_out`

Turn database rows into JSON-friendly dicts: datetimes become ISO strings with `Z` (they are UTC).

## `add_school`

`POST /admin/v1/schools`: adds a school, with optional campuses and its semester dates. With an Untis server it queues `refresh_classes` right away, so the worker fetches the class list within seconds. The slug must be unique (409 `slug_taken`).

## `admin`

The dependency on every admin route: checks the token in constant time and returns the actor name (from `X-Admin-Actor`, default `console`) for `record`.

## `admin_log`

`GET /admin/v1/log`: the latest admin actions, newest first (the console's Activity).

## `api_error`, `validation_error`, `ADMIN_ERRORS`

Same error shape as the public API (`{code, message}`), in English. Admin-specific messages are in `ADMIN_ERRORS`; the rest come from `i18n.ERRORS`.

## `classes`

`GET /admin/v1/schools/{id}/classes?q=&errors=`: the classes Untis lists for a school, with how many students follow each (most followed first) and the state of the last sync.

## `delete_job`

`DELETE /admin/v1/jobs/{id}`: drop a job that isn't running.

## `delete_school`

`DELETE /admin/v1/schools/{id}`: only for a school **no user has** (409 `school_in_use` otherwise; turn it off instead). Its classes, their lessons and its campuses are deleted; sources that followed its classes are soft-deleted.

## `delete_user`

`DELETE /admin/v1/users/{id}`: the same as 'Delete account' in the app (`accounts.delete_user`), logged with the user's name.

## `edit_school`

`PATCH /admin/v1/schools/{id}`: change any field, including `active`. Turning a school off hides it from onboarding (`r_schools.schools` only lists active ones) without touching its users.

## `health`

`GET /admin/health`: needs no token. Says whether the service is up and whether `ADMIN_TOKEN` is configured (the console's Connection screen).

## `job_list`

`GET /admin/v1/jobs?status=&kind=`: the job queue (`jobs.py`) with per-kind/status counts. Payload fields `code` and `email` are masked. Finished jobs have no payload (cleared in `jobs._finish`).

## `logout_user`

`POST /admin/v1/users/{id}/logout-all`: revoke every session. Access tokens stop working at once because `deps.auth` checks the session on every request.

## `overview`

`GET /admin/v1/overview`: the console's first card. Counts users, guests, active users, schools, classes, jobs and sync errors; reports worker and mail health from `debug.diagnose()`; lists applied migrations.

## `record`

Writes one line to `admin_log` (actor, action, target, JSON detail), inside the caller's transaction when `c` is given, so the log and the change commit together.

## `refresh_school_classes`

`POST /admin/v1/schools/{id}/refresh-classes`: queue a new fetch of the class list from Untis (the `refresh_classes` job in `sync.py`). The worker also does this every 24 hours by itself.

## `run_job_now`

`POST /admin/v1/jobs/{id}/run-now`: a queued job waiting out its backoff runs at the next worker round. Finished and failed jobs can't be re-run (no payload left): queue the work again instead (class sync, refresh-classes).

## `schools`

`GET /admin/v1/schools`: all schools (active ones first) with their campuses and how many users are on each campus.

## `sync_class_now`

`POST /admin/v1/classes/{id}/sync`: fetch this class's timetable now (`sync.queue_class` with high priority).

## `table_rows`

`GET /admin/v1/tables/{table}?column=&value=`: rows of one table, newest first by primary key, with an optional equality filter. The table and column names are checked against the real schema before they go into SQL. Secret columns are masked and binary values summarised. **Read-only on purpose**: changes go through the curated endpoints or a migration.

## `untis_search`

`GET /admin/v1/untis/search?q=`: Untis' own school search (`untis.search_schools`). The console uses it in 'Add school' to fill in the server and login name.

## `user`

`GET /admin/v1/users/{id}`: one user with their sign-in methods, sessions (devices), timetables and friends.

## `users`

`GET /admin/v1/users?q=&kind=&school_id=`: search by name, e-mail or id (digits only means an id). `kind` filters guests, signed-in users or turned-off users. Paged with `limit`/`offset`; `total` is the full count.
