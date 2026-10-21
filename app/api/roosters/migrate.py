"""Database migrations: runs every migrations/NNNN_name.sql that hasn't run yet, in order.

Runs once per deploy as its own step (the `migrate` service in docker compose), never at API start:
with several API servers that would race. A MySQL lock makes a second runner wait.

    python -m roosters.migrate
"""
import logging
import sys
import time
from pathlib import Path

import pymysql

from . import db

log = logging.getLogger("roosters.migrate")

DIR = Path(__file__).parent / "migrations"


def statements(sql: str) -> list[str]:
    """Splits a file into statements. Keep it simple: no ';' inside strings in migrations."""
    lines = [line for line in sql.splitlines() if not line.strip().startswith("--")]
    return [part.strip() for part in "\n".join(lines).split(";") if part.strip()]


def wait_for_db(seconds: float):
    deadline = time.time() + seconds
    while True:
        try:
            with db.conn():
                return
        except pymysql.err.OperationalError:
            if time.time() > deadline:
                raise
            time.sleep(2)


def migrate(wait: float = 60) -> list[str]:
    """Returns the versions that were applied now."""
    wait_for_db(wait)
    applied = []
    with db.conn() as c:
        db.run("CREATE TABLE IF NOT EXISTS schema_migrations ("
               "version VARCHAR(80) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)", c=c)
        if not db.one("SELECT GET_LOCK('roosters_migrate', 120) AS ok", c=c)["ok"]:
            raise RuntimeError("another migration is still running")
        try:
            done = {r["version"] for r in db.rows("SELECT version FROM schema_migrations", c=c)}
            for path in sorted(DIR.glob("*.sql")):
                if path.stem in done:
                    continue
                log.info("migration %s", path.stem)
                for st in statements(path.read_text()):
                    db.run(st, c=c)
                db.run("INSERT INTO schema_migrations (version) VALUES (%s)", (path.stem,), c=c)
                applied.append(path.stem)
        finally:
            db.run("SELECT RELEASE_LOCK('roosters_migrate')", c=c)
    return applied


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    done = migrate(wait=120)
    log.info("up to date (%s new)", len(done))
    sys.exit(0)
