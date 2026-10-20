"""Idempotency-Key for writes. On bad wifi a request often arrives but the answer gets lost, and the app
retries. With the same key, the second request gets the stored answer instead of running again
(no double chat messages or break requests).

Only for signed-in users; the app sends a new random key per action (and the same one on a retry)."""
import re

import pymysql
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from . import db, tokens
from .deps import json_error
from .errors import ApiError

KEY_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
WRITES = ("POST", "PUT", "PATCH", "DELETE")


def _reserve(user_id: int, key: str, method: str, path: str) -> dict | None:
    """None = reserved for us; otherwise the existing row."""
    try:
        db.run("INSERT INTO idempotency_keys (user_id, idem_key, method, path) VALUES (%s,%s,%s,%s)",
               (user_id, key, method, path))
        return None
    except pymysql.err.IntegrityError as e:
        if e.args[0] != db.DUPLICATE:
            raise
    return db.one("SELECT * FROM idempotency_keys WHERE user_id=%s AND idem_key=%s", (user_id, key))


def _store(user_id: int, key: str, status: int, body: bytes):
    if status >= 500:
        # Server error: let the retry run for real
        db.run("DELETE FROM idempotency_keys WHERE user_id=%s AND idem_key=%s", (user_id, key))
    else:
        db.run("UPDATE idempotency_keys SET status_code=%s, body=%s WHERE user_id=%s AND idem_key=%s",
               (status, body.decode("utf-8", "replace"), user_id, key))


class IdempotencyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        key = request.headers.get("idempotency-key")
        if request.method not in WRITES or not key:
            return await call_next(request)
        if not KEY_RE.match(key):
            return json_error(request, ApiError(400, "invalid"))
        user_id = tokens.user_from_header(request.headers.get("authorization"))
        if user_id is None:
            return await call_next(request)
        path = request.url.path[:255]
        row = await run_in_threadpool(_reserve, user_id, key, request.method, path)
        if row is not None:
            if row["method"] != request.method or row["path"] != path:
                return json_error(request, ApiError(422, "idempotency_mismatch"))
            if row["status_code"] is None:
                return json_error(request, ApiError(409, "idempotency_busy"))
            return Response(row["body"] or b"", status_code=row["status_code"], media_type="application/json",
                            headers={"Idempotent-Replayed": "true"})
        try:
            response = await call_next(request)
        except Exception:
            await run_in_threadpool(_store, user_id, key, 500, b"")
            raise
        body = b"".join([chunk async for chunk in response.body_iterator])
        await run_in_threadpool(_store, user_id, key, response.status_code, body)
        headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
        return Response(body, status_code=response.status_code, headers=headers, media_type=response.media_type)


def cleanup(days: int = 2):
    db.run("DELETE FROM idempotency_keys WHERE created_at < UTC_TIMESTAMP() - INTERVAL %s DAY", (days,))
