---
updated: 2026-10-23T17:30:00Z
---

Reads the **deployed code** (read-only mount) and lists every file with its symbols. It never writes,
and it never reads secrets: dot-files (like `.env`) are skipped, and compose doesn't even mount `.env`.

Per language: Python via `ast` (functions, classes and methods, FastAPI routes with their full path,
job handlers, UPPERCASE constants, docstrings); TypeScript/TSX via regex (exported functions, components,
hooks, consts, types, screens, and the JSDoc above them); SQL (`CREATE`/`ALTER TABLE` with the comment
above); YAML (compose services, workflow jobs). Every file and symbol gets a hash, so a doc knows when its
code changed.

**When a doc heading doesn't match:** `GET /docs/v1/file?path=…` lists the names exactly as the scanner
sees them.

## `INCLUDE`, `SKIP_DIRS`, `SKIP_FILES`, `SKIP_PATHS`, `MAX_FILE`

What counts as code: these extensions plus Dockerfiles and `.env.example`; not node_modules, build output, caches, native folders, the design export, the docs' own content, or files over 512 KB.

## `ROUTE_METHODS`, `_prefixes`, `_route`

FastAPI routes: `router = APIRouter(prefix=...)` gives the prefix, and `@router.get('/x')` the method and path, so a route shows as `GET /api/v1/me/today`. `@jobs.handler('kind')` shows as `JOB kind`.

## `Scanner`

Keeps the last scan and re-reads only files whose mtime or size changed (checked at most every 3 s), so every request sees the current code cheaply. `source` serves line ranges of known files only.

## `Symbol`, `File`

What the scan returns per symbol (name, kind, lines, signature, comment, route, hash, parent class) and per file.

## `TS_DECL`, `_jsdoc_before`, `_typescript`, `_ts_header`

TypeScript: declarations at the start of a line, their JSDoc or // comment, kinds (hook = `use…`, component = capitalised, screen = the default export of a route file), and the file header comment (only one that isn't a symbol's JSDoc).

## `_h`, `_lang`

A short SHA-256; the language from the extension.

## `_python`

Module docstring + top-level functions, classes (and their methods as `Class.method`) and UPPERCASE constants (also tuple assignments).

## `_signature`

`def name(args) -> ret` from the AST.

## `_sql`

Tables with the `--` comment lines above them; `ALTER TABLE` as `<table> (alter at line N)`.

## `_yaml`

Compose services and workflow jobs, with the `#` comment above each.

## `scan_file`, `walk`

Scan one file; list all included files under the root.
