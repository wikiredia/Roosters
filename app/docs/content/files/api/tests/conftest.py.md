---
updated: 2026-10-24T13:10:00Z
---

Test setup. The tests run against a **real MySQL and Valkey**, not mocks: start them with
`docker compose -f app/docker-compose.test.yml up -d` (CI uses service containers), then `cd app/api && pytest`.

The schema is dropped and migrated once per session; every test starts with **empty tables** and an empty
Redis database. The environment (database, SECRET_KEY, client ids, ADMIN_TOKEN, `MAIL_MODE` and `PUSH_MODE`
console: nothing leaves the machine) is set at the top, before `roosters` is imported.

## `client`, `mails`

A TestClient for the public API; `mails` captures what would be sent, as (to, subject, body).

## `login`

Signs in with a real e-mail code (start → run the mail job → read the code from the mail → verify) and returns the tokens, auth headers and user id.

## `onboard`, `befriend`

Set school, campus and onboarded and follow a class; make two users friends through an invite link.

## `run_jobs`

Run queued jobs inline (the worker isn't running in tests).

## `schema`, `clean`

Session fixture: drop everything and run all migrations. Autouse per test: empty every table (except `schema_migrations`) and flush Redis.

## `school`, `today`, `add_class_lessons`

Test data: AP with two campuses and two classes (the first already fetched), and helpers to put lessons on a day.
