---
updated: 2026-10-23T17:30:00Z
---

The texts, in **SQLite** (`/data/docs.sqlite` in the `docs` volume, WAL mode). Two tables: `entries` (the
current text of each key) and `revisions` (every save and delete, with author, note and time).

Keys: `page:<slug>`, `file:<path>`, `sym:<path>#<name>` (or `#a,b` for a group). Back up the volume
(or `docs/sync.sh pull` into git) and nothing is lost.

## `SCHEMA`

The two tables and their indexes.

## `Store`

get / all / for_path / search; `put` (upsert + revision in one transaction), `delete` (a revision marked deleted), history, recent, revision, counts. One lock per process for writes.

## `now`

UTC now as ISO text with Z (comparable as strings, which import uses).

## `page_key`, `file_key`, `sym_key`, `normalize_symbol`

Building keys; a group's names are trimmed and joined with commas.
