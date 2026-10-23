---
updated: 2026-10-23T17:30:00Z
---

A thin layer over **PyMySQL**: a small connection pool and helpers that return dicts. There's no ORM
on purpose: queries are plain SQL with `%s` parameters, written where they're used.

- Every connection runs in **UTC** (`time_zone = '+00:00'`) with autocommit. Use `tx()` for anything that
  must be all-or-nothing, and pass its connection `c` to the helpers inside it.
- **Never** put user input into SQL with f-strings; only table or column names we chose ourselves (the
  admin table browser checks names against `SHOW TABLES` first).
- Times: `DATETIME` columns hold naive UTC; use `utcnow()`, not `datetime.now()`.

## `DUPLICATE`

MySQL error number for a duplicate unique key (1062). Code that races on purpose catches it, e.g. two simultaneous first sign-ins in `r_auth._provider_login`, or `idempotency._reserve`.

## `_default`, `js`, `unjs`

JSON in and out of `JSON` columns (job payloads, source config, notifications). `unjs` never raises: bad or empty input gives the default.

## `conn`

Borrow a pooled connection (pinged first, reconnected if dead) and give it back afterwards. An exception rolls back whatever was open.

## `connect`

A new connection: DictCursor, utf8mb4, autocommit, UTC.

## `in_list`

Placeholders for `IN (...)`. An empty list becomes `IN (NULL)` (matches nothing) because MySQL rejects `IN ()`.

## `reset_pool`

Close every pooled connection (tests that switch databases).

## `rows`, `one`, `run`, `many`

The query helpers. `rows` returns a list of dicts and `one` the first or None. `run` executes and returns `lastrowid` (or the affected row count when there's no id). `many` is `executemany`. All accept `c=` to run inside a transaction.

## `tx`

A transaction: `with db.tx() as c:` ... commit on success, rollback on any exception. Use `SELECT ... FOR UPDATE` inside it to lock the rows you're about to change.

## `utcnow`

Naive UTC now, rounded to whole seconds (MySQL rounds fractions up, which would put 'now' in the future).
