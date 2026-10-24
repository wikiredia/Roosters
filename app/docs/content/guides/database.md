---
title: Database and migrations
position: 50
updated: 2026-10-24T05:27:10Z
---

MySQL 8.4 (`db` service, internal network only, data in the `db` volume). All tables with comments:
`api/roosters/migrations/0001_init.sql`, then `0002_guests_admin.sql`, `0003_semesters.sql`, `0004_class_weeks.sql` and `0005_lesson_kinds.sql`.

| Area | Tables |
| --- | --- |
| Schools | `schools`, `campuses`, `school_classes`, `class_lessons`, `class_courses`, `class_weeks` |
| Accounts | `users`, `auth_identities`, `login_codes`, `sessions` |
| Social | `friendships`, `friend_requests`, `blocks`, `invites`, `break_requests`, `break_request_members` |
| Timetables | `sources`, `source_lessons`, `hidden_courses`, `checkins` |
| Other | `notifications`, `jobs`, `idempotency_keys`, `settings`, `admin_log`, `schema_migrations` |

## Conventions

- `DATETIME` = UTC (connections run at `+00:00`, use `db.utcnow()`); times of day = minutes since midnight.
- Plain SQL with `%s` parameters (`db.rows/one/run`); `db.tx()` for all-or-nothing with `FOR UPDATE` locks.
- Accounts are deleted for real (`accounts.delete_user`): a new per-user table must be added there.

## Changing the schema

1. Add `api/roosters/migrations/NNNN_name.sql` (the next number). Never edit one that already ran.
2. It runs on the next `docker compose up` (the `migrate` service), before the API starts.
3. Document the new tables in that migration's doc page, and in this guide if it's a new area.

## Looking at data

Console → Roosters+ → **Database** (read-only, secrets masked), or **MySQL shell** for anything else.
Changes to schools and users go through **Schools & classes** and **Users**, which keep things consistent
and record who did what.
