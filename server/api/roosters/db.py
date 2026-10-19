"""Kleine laag boven PyMySQL: een pool van verbindingen en een paar helpers."""
import datetime as dt
import decimal
import json
import queue
import threading
import time
from contextlib import contextmanager
from pathlib import Path

import pymysql
import pymysql.cursors

from . import config

_pool: "queue.LifoQueue[pymysql.connections.Connection]" = queue.LifoQueue(maxsize=8)
_lock = threading.Lock()


def _connect():
    return pymysql.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
        connect_timeout=10,
        init_command="SET time_zone = '+00:00'",
    )


@contextmanager
def conn():
    try:
        c = _pool.get_nowait()
        try:
            c.ping(reconnect=True)
        except Exception:
            c = _connect()
    except queue.Empty:
        c = _connect()
    try:
        yield c
    except Exception:
        try:
            c.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            _pool.put_nowait(c)
        except queue.Full:
            c.close()


@contextmanager
def tx():
    """Transactie: alles of niets."""
    with conn() as c:
        c.begin()
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise


def rows(sql, args=None, c=None):
    if c is not None:
        with c.cursor() as cur:
            cur.execute(sql, args)
            return list(cur.fetchall())
    with conn() as c2:
        return rows(sql, args, c2)


def one(sql, args=None, c=None):
    r = rows(sql, args, c)
    return r[0] if r else None


def run(sql, args=None, c=None):
    """Voert uit en geeft lastrowid terug (of het aantal rijen)."""
    if c is not None:
        with c.cursor() as cur:
            n = cur.execute(sql, args)
            return cur.lastrowid or n
    with conn() as c2:
        return run(sql, args, c2)


def many(sql, data, c=None):
    if not data:
        return
    if c is not None:
        with c.cursor() as cur:
            cur.executemany(sql, data)
        return
    with conn() as c2:
        many(sql, data, c2)


def utcnow() -> dt.datetime:
    """Naïeve UTC-tijd, zoals MySQL ze teruggeeft (de verbinding staat op +00:00)."""
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


def _default(o):
    if isinstance(o, dt.datetime):
        return o.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(o, dt.date):
        return o.isoformat()
    if isinstance(o, decimal.Decimal):
        return float(o)
    if isinstance(o, (bytes, bytearray)):
        return None
    raise TypeError(f"niet te bewaren als JSON: {type(o)}")


def js(value) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False, default=_default)


def unjs(value, default=None):
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return default


def get_setting(key, default=None):
    row = one("SELECT v FROM settings WHERE k=%s", (key,))
    return row["v"] if row else default


def set_setting(key, value):
    run("INSERT INTO settings (k, v) VALUES (%s, %s) ON DUPLICATE KEY UPDATE v=VALUES(v)", (key, value))


def init_schema(wait: float = 60):
    """Wacht tot MySQL klaar is en maakt de tabellen aan."""
    deadline = time.time() + wait
    while True:
        try:
            with conn() as c:
                break
        except pymysql.err.OperationalError:
            if time.time() > deadline:
                raise
            time.sleep(2)
    with _lock:
        sql = (Path(__file__).parent / "schema.sql").read_text()
        sql = "\n".join(line for line in sql.splitlines() if not line.strip().startswith("--"))
        with conn() as c:
            for part in sql.split(";"):
                if part.strip():
                    run(part, c=c)
