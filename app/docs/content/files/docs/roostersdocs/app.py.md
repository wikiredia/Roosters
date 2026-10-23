---
updated: 2026-10-23T17:30:00Z
---

The **docs service API** (`uvicorn roostersdocs.app:app`, compose service `docs`, 127.0.0.1:8095), behind
the console's Roosters+ → Documentation. It combines two things:

- **what the code is**, scanned live from the read-only mount (`scan.py`): the file tree, symbols,
  routes and code comments, and hashes for stale detection;
- **what people and agents wrote**, from SQLite (`store.py`): the hub, guides, file and symbol docs, and
  every revision.

Reading is open (loopback only). Writing needs `DOCS_TOKEN` and names its author (`X-Docs-Author`).
At start it imports `app/docs/content` (`import_content`).

An entry's **state**: `fresh`, `stale` (the code hash changed since it was written; update it or `confirm`
it), or `orphan` (the file or symbol is gone).

## `ConfirmIn`, `confirm`

`POST /docs/v1/confirm`: 'still correct' after a code change: same text, new hash, a revision noting it.

## `FileDocIn`, `put_file_doc`

`PUT /docs/v1/file`: write a file doc (no symbol) or a symbol/group doc. Unknown symbols are refused, with the list of known ones. The entry is stamped with the current code hash (fresh).

## `SRC`, `DB`, `CONTENT`, `TOKEN`

Environment: the code mount, the SQLite file, the repo Markdown to import, the write token.

## `_entry_state`

fresh / stale / orphan, as described above.

## `_file`

A scanned file or 404.

## `_summary`

The first sentence-like line of a text, without Markdown markers (shown in the tree and on guide cards). Headings, tables, code blocks and diagrams are skipped.

## `_sym_hash`

The code hash a symbol doc is checked against; for a group (`a,b`), all members' hashes together. None when a member doesn't exist.

## `agents`

`GET /docs/v1/agents`: the agent rules (`app/docs/README.md`) as plain text.

## `delete_file_doc`

`DELETE /docs/v1/file?path=&symbol=`.

## `export`, `reimport`

`GET /docs/v1/export`: the live docs in the repo's Markdown format (`docs/sync.sh pull` writes them). `POST /docs/v1/import`: read the repo content again.

## `file`

`GET /docs/v1/file?path=`: one file's doc and state, every symbol (kind, line, signature, route, code comment) with the key of the doc that covers it, and the symbol/group docs.

## `health`

`GET /docs/health`: up, writable (token set), how many files and entries.

## `history`, `recent`, `RevertIn`, `revert`

Revisions per entry, the latest changes overall, and restoring an old revision (itself a new revision).

## `http_error`

Errors as `{message}` (the console shows them).

## `hub`

`GET /docs/v1/hub`: the hub page, the list of guides and the coverage numbers (the console's start page).

## `import_content`

Repo Markdown → store: adds missing entries, replaces an entry only when the repo's `updated` is newer than the live one (or everything with `force`). Imported entries are stamped with the current code hash. A date in the future is capped at now, so a typo can't make a repo copy beat every live edit.

## `lifespan`

Imports the repo content at start.

## `page`, `PageIn`, `put_page`, `delete_page`

Guides (and the hub) by slug. The hub can be edited but not deleted.

## `routes`

`GET /docs/v1/routes`: every HTTP route and job handler with its file, line and doc.

## `search`

`GET /docs/v1/search?q=`: docs text plus file paths, symbol names, routes and code comments.

## `source`

`GET /docs/v1/source?path=&start=&end=`: lines of a scanned file (at most 800). Only files the scan knows, so there are no path tricks and no `.env`.

## `status`

`GET /docs/v1/status`: coverage and the to-do lists (missing file docs, stale, orphaned).

## `tree`

`GET /docs/v1/tree`: every file with its summary (its doc, or the comment at the top of the code), and whether it's documented or stale.

## `writer`

Write access: 503 without a configured token, 401 with a wrong one. Returns the author name.
