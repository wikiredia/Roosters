---
updated: 2026-10-23T17:30:00Z
---

**Database migrations**: runs every `migrations/NNNN_name.sql` that hasn't run yet, in order, and
records it in `schema_migrations`.

- Runs once per deploy as its own step (compose service `migrate`; `api`, `worker` and `admin` wait for
  it). It never runs at API start, because several API processes would race. A MySQL `GET_LOCK` makes a
  second runner wait.
- **Writing a migration:** add the next number (`0003_what.sql`), use plain statements separated by `;`
  (the splitter is simple: no `;` inside strings), and never edit a migration that has already run
  anywhere. Then document the new tables in its docs file.

## `DIR`

The `migrations/` folder next to this file.

## `migrate`

Applies what's missing under the `roosters_migrate` lock. Returns the versions applied now.

## `statements`

Splits a file into statements: drops `--` comment lines, splits on `;`.

## `wait_for_db`

Retry connecting until the database answers (MySQL takes a while on first start).
