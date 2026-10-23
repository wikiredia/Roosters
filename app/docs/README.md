# Roosters+ docs service

The living documentation of Roosters+ (everything under `app/`): a **hub** that explains the
architecture and where to look, **guides** per topic, and a doc for **every file** and its
**functions, classes, routes and tables**. It is what the Smart-Room console's **Roosters+** tab shows.

```
 Smart-Room console (:8443) ── Roosters+ tab ──> 127.0.0.1:8095  docs service  (this folder)
                                             └─> 127.0.0.1:8090  admin API     (api/roosters/admin.py)

 docs service ── reads ──> app/ (the deployed code, read-only mount): file tree, symbols, routes, hashes
              └─ keeps ──> SQLite in the `docs` volume: the texts + every revision
              └─ imports ─> app/docs/content/*.md at start (the copy that lives in git)
```

- **Live**: an edit through the console or the API is visible at once. No git push, no rebuild.
- **Never out of sight of the code**: the tree, the function list, the routes and the comments in
  the code come from the code itself, scanned on every request (only changed files are re-read). Each doc
  remembers the code it was written against; when that code changes, the doc is flagged **stale** until
  someone updates it or confirms it's still right.
- **History**: every edit is a revision (who, when, what). Anything can be reverted.
- **In git too**: `app/docs/content/` holds the same docs as Markdown. The service imports it at start
  (new entries are added; an entry is replaced only when the repo copy is *newer* than the live one), and
  `./docs/sync.sh pull` writes the live docs back into it for a commit.

## Running it

It's the `docs` service in `app/docker-compose.yml`: `docker compose up -d --build docs`.
It listens on `127.0.0.1:8095` only. Reading is open; writing needs `DOCS_TOKEN` from `app/.env`
(32+ characters) as `Authorization: Bearer …`, plus `X-Docs-Author: <your name>`.

| | |
| --- | --- |
| Hub, guides, coverage | `GET /docs/v1/hub` |
| A guide | `GET /docs/v1/pages/{slug}` · `PUT` `{title, body, position?, note?}` |
| File tree with doc status | `GET /docs/v1/tree` |
| One file: doc, symbols, symbol docs | `GET /docs/v1/file?path=api/roosters/r_auth.py` |
| Write a file or symbol doc | `PUT /docs/v1/file` `{path, symbol?, body, note?}` (`symbol: "a,b"` documents a group) |
| "Still correct" after a code change | `POST /docs/v1/confirm` `{path, symbol?}` |
| Code | `GET /docs/v1/source?path=…&start=10&end=40` |
| Search docs + code | `GET /docs/v1/search?q=guest` |
| Every route and job | `GET /docs/v1/routes` |
| To-do: missing, stale, orphaned | `GET /docs/v1/status` (or `./docs/sync.sh status`) |
| History, revert | `GET /docs/v1/history?key=…` · `GET /docs/v1/recent` · `POST /docs/v1/revert {id}` |
| Repo ⇄ live | `GET /docs/v1/export` · `POST /docs/v1/import[?force=true]` · `./docs/sync.sh pull\|push` |

Keys: `page:<slug>`, `file:<path>`, `sym:<path>#<name>` (or `#a,b` for a group). Paths are relative to `app/`.

## For agents: keeping the docs up to date

**Every change to code under `app/` comes with its docs.** No separate task, no asking.

1. **Before you change something**, read what's there: the hub (`GET /docs/v1/hub` or
   `app/docs/content/hub.md`), the guide for the area, and the file's doc (`GET /docs/v1/file?path=…` or
   `app/docs/content/files/<path>.md`). It tells you where things live and what to watch out for.
2. **After you changed code**, update the docs for what you touched:
   - a new file → a file doc (what it's for, who calls it, what to watch out for) and docs for its
     functions/routes (or groups of them);
   - a changed function → update its doc, or `POST /docs/v1/confirm` if the doc is still right;
   - a removed or renamed function/file → delete or move its doc (`GET /docs/v1/status` lists orphans);
   - a change in how parts fit together (a new service, a new table, a new flow) → update the hub or
     the guide too.
3. **Where to write**, depending on where you run:
   - **On the laptop** (the console's Claude tab, a terminal there): use the live API on
     `http://127.0.0.1:8095` with `DOCS_TOKEN` from `app/.env`. Then `./docs/sync.sh pull` and commit
     `app/docs/content` with your code, so the repo has the same text.
   - **Anywhere else** (a cloud sandbox, CI, another machine: the service isn't reachable there):
     edit the Markdown in `app/docs/content/` in the same commit as the code, and set `updated:` in the
     front matter to the current UTC time. After deploy, the service imports it (newer than live wins);
     `./docs/sync.sh push` does it right away.
4. **Check** `GET /docs/v1/status` (or `./docs/sync.sh status`): nothing you touched should be missing,
   stale or orphaned. Without the service: `cd app/docs && python check_content.py` (CI runs it too) checks
   that every heading in `content/` names a file and symbol that exist.

### How to write a doc

- **Say what it's for and why**, not what the code literally does line by line: who calls it, what it
  guarantees, what breaks if you change it, the non-obvious decisions ("a whole school shares one IP, so
  the rate limit is generous").
- Name the **related places** with paths: "the app side is `mobile/src/lib/onboarding.ts`".
- Group small helpers into one section (`## \`_email\`, \`_client_ip\``) instead of a doc per one-liner.
- File doc format (`app/docs/content/files/<path>.md`):

  ```markdown
  ---
  updated: 2026-10-23T17:00:00Z
  ---

  What the file is for, how it fits in, what to watch out for.

  ## `function_name`

  What it does, when it's called, what to keep in mind.

  ## `helper_a`, `helper_b`

  A group doc.
  ```

  Headings in backticks must be symbol names the scanner knows (`GET /docs/v1/file?path=…` lists them:
  Python functions/classes/`Class.method`/UPPERCASE constants, TS exports, SQL tables, compose
  services). Other `##` headings are just part of the file text.
- Guides and the hub (`app/docs/content/hub.md`, `guides/<slug>.md`) have `title`, `position` and
  `updated` in the front matter.
