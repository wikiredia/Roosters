"""Thin layer over PyMySQL: a connection pool and a few helpers (same as v1, without the schema)."""
import datetime as dt
import decimal
import json
import queue
from contextlib import contextmanager

import pymysql
import pymysql.cursors

from . import config

_pool: "queue.LifoQueue[pymysql.connections.Connection]" = queue.LifoQueue(maxsize=config.DB_POOL)

# Duplicate entry for a unique key
DUPLICATE = 1062


def connect(database: str | None = None):
    return pymysql.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME if database is None else database,
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
            c.ping()
        except Exception:
            try:
                c.close()
            except Exception:
                pass
            c = connect()
    except queue.Empty:
        c = connect()
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


def reset_pool():
    """Close all pooled connections (tests switch databases)."""
    while True:
        try:
            _pool.get_nowait().close()
        except queue.Empty:
            return
        except Exception:
            pass


@contextmanager
def tx():
    """Transaction: all or nothing."""
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
    """Executes and returns lastrowid (or the number of affected rows)."""
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
    """Naive UTC time, as MySQL returns it (the connection is set to +00:00). Whole seconds: MySQL
    rounds fractions *up* when storing a DATETIME, which would put "now" half a second in the future."""
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None, microsecond=0)


def _default(o):
    if isinstance(o, dt.datetime):
        return o.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(o, dt.date):
        return o.isoformat()
    if isinstance(o, decimal.Decimal):
        return float(o)
    if isinstance(o, (bytes, bytearray)):
        return None
    raise TypeError(f"cannot store as JSON: {type(o)}")


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


def in_list(ids) -> tuple[str, list]:
    """Placeholders and arguments for `IN (...)`. MySQL refuses `IN ()`, so an empty list
    becomes `IN (NULL)`, which matches nothing."""
    ids = list(ids)
    if not ids:
        return "NULL", []
    return ",".join(["%s"] * len(ids)), ids
