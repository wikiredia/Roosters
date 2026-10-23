"""The documentation texts: SQLite in the `docs` volume, every edit kept as a revision.

Keys
    page:<slug>                    the hub (page:hub) and guides (page:guide-auth, ...)
    file:<path>                    what a file is for (path relative to app/)
    sym:<path>#<name>[,<name>...]  one function/class/route/table, or a group of them documented together

An entry remembers the code hash it was written against (file hash for file:, symbol hashes for sym:);
when the code changes, the entry shows up as stale until someone updates (or re-confirms) it.

Content from the repo (app/docs/content/*.md, see content.py) is imported at start: new entries are
added, an entry is replaced only when the repo's copy is newer than the live one."""
import datetime as dt
import sqlite3
import threading

SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
  key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,              -- page, file, sym
  path TEXT,                       -- file path (file/sym) or NULL (page)
  symbol TEXT,                     -- 'name' or 'a,b,c' (sym only)
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 100,
  code_hash TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS k_entries_path ON entries(path);
CREATE TABLE IF NOT EXISTS revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  code_hash TEXT,
  author TEXT NOT NULL,
  note TEXT,
  at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS k_revisions_key ON revisions(key, id);
"""


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def page_key(slug: str) -> str:
    return f"page:{slug}"


def file_key(path: str) -> str:
    return f"file:{path}"


def sym_key(path: str, symbol: str) -> str:
    return f"sym:{path}#{normalize_symbol(symbol)}"


def normalize_symbol(symbol: str) -> str:
    return ",".join(s.strip() for s in symbol.split(",") if s.strip())


class Store:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(SCHEMA)

    # ---- reading ----

    def get(self, key: str) -> dict | None:
        r = self.db.execute("SELECT * FROM entries WHERE key=?", (key,)).fetchone()
        return dict(r) if r else None

    def all(self, kind: str | None = None) -> list[dict]:
        sql, args = "SELECT * FROM entries", ()
        if kind:
            sql, args = sql + " WHERE kind=?", (kind,)
        return [dict(r) for r in self.db.execute(sql + " ORDER BY position, key", args)]

    def for_path(self, path: str) -> list[dict]:
        return [dict(r) for r in self.db.execute("SELECT * FROM entries WHERE path=? ORDER BY key", (path,))]

    def history(self, key: str, limit: int = 50) -> list[dict]:
        return [dict(r) for r in self.db.execute(
            "SELECT id, key, title, body, code_hash, author, note, at, deleted FROM revisions WHERE key=? "
            "ORDER BY id DESC LIMIT ?", (key, limit))]

    def recent(self, limit: int = 50) -> list[dict]:
        return [dict(r) for r in self.db.execute(
            "SELECT id, key, title, author, note, at, deleted FROM revisions ORDER BY id DESC LIMIT ?", (limit,))]

    def revision(self, rid: int) -> dict | None:
        r = self.db.execute("SELECT * FROM revisions WHERE id=?", (rid,)).fetchone()
        return dict(r) if r else None

    def search(self, q: str, limit: int = 60) -> list[dict]:
        like = f"%{q.strip()}%"
        return [dict(r) for r in self.db.execute(
            "SELECT key, kind, path, symbol, title, substr(body, 1, 400) AS body FROM entries "
            "WHERE title LIKE ? OR body LIKE ? OR symbol LIKE ? OR path LIKE ? ORDER BY kind, key LIMIT ?",
            (like, like, like, like, limit))]

    # ---- writing ----

    def put(self, key: str, *, kind: str, body: str, author: str, title: str = "", path: str | None = None,
            symbol: str | None = None, position: int | None = None, code_hash: str | None = None,
            note: str | None = None, at: str | None = None) -> dict:
        at = at or now()
        with self._lock:
            old = self.get(key)
            pos = position if position is not None else (old["position"] if old else 100)
            self.db.execute("BEGIN")
            try:
                self.db.execute(
                    "INSERT INTO entries (key, kind, path, symbol, title, body, position, code_hash, updated_at, "
                    "updated_by) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET title=excluded.title, "
                    "body=excluded.body, position=excluded.position, code_hash=excluded.code_hash, "
                    "updated_at=excluded.updated_at, updated_by=excluded.updated_by",
                    (key, kind, path, symbol, title, body, pos, code_hash, at, author))
                self.db.execute("INSERT INTO revisions (key, title, body, code_hash, author, note, at) "
                                "VALUES (?,?,?,?,?,?,?)", (key, title, body, code_hash, author, note, at))
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise
        return self.get(key)

    def delete(self, key: str, author: str, note: str | None = None) -> bool:
        with self._lock:
            old = self.get(key)
            if not old:
                return False
            self.db.execute("BEGIN")
            self.db.execute("DELETE FROM entries WHERE key=?", (key,))
            self.db.execute("INSERT INTO revisions (key, title, body, code_hash, author, note, at, deleted) "
                            "VALUES (?,?,?,?,?,?,?,1)", (key, old["title"], old["body"], old["code_hash"], author,
                                                         note, now()))
            self.db.execute("COMMIT")
        return True

    def counts(self) -> dict:
        return {r["kind"]: r["n"] for r in self.db.execute("SELECT kind, COUNT(*) AS n FROM entries GROUP BY kind")}
