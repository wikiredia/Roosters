"""Who is asking: the signed-in user behind the access token, and small helpers for answers."""
import datetime as dt
import hashlib
from dataclasses import dataclass

from fastapi import Request, Response
from fastapi.responses import JSONResponse

from . import db, i18n, tokens
from .errors import ApiError


@dataclass
class Ctx:
    user: dict
    session_id: int

    @property
    def uid(self) -> int:
        return self.user["id"]


def auth(request: Request) -> Ctx:
    header = request.headers.get("authorization") or ""
    if not header.lower().startswith("bearer "):
        raise ApiError(401, "auth_required")
    user_id, session_id = tokens.decode_access(header[7:].strip())
    # The session must still exist: "log out everywhere" and account deletion work immediately
    row = db.one(
        "SELECT u.*, sch.tz FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN schools sch ON sch.id=u.school_id "
        "WHERE s.id=%s AND s.user_id=%s AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP()",
        (session_id, user_id))
    if row is None:
        raise ApiError(401, "auth_required")
    request.state.lang = row["locale"]
    return Ctx(row, session_id)


def lang(request: Request) -> str:
    return getattr(request.state, "lang", None) or i18n.lang_of(request.headers.get("accept-language"))


def etag_json(request: Request, data) -> Response:
    """JSON with an ETag: when nothing changed, the app gets an empty 304 (a few bytes on slow wifi)."""
    body = db.js(data).encode()
    tag = '"' + hashlib.sha1(body).hexdigest()[:20] + '"'
    headers = {"ETag": tag, "Cache-Control": "private, no-cache"}
    if tag in [t.strip() for t in (request.headers.get("if-none-match") or "").split(",")]:
        return Response(status_code=304, headers=headers)
    return Response(body, media_type="application/json", headers=headers)


def parse_day(value: str | None, default: dt.date) -> dt.date:
    if not value:
        return default
    try:
        return dt.date.fromisoformat(value)
    except ValueError:
        raise ApiError(400, "day_invalid")


def json_error(request: Request, exc: ApiError) -> JSONResponse:
    body = {"code": exc.code, "message": i18n.error(exc.code, lang(request)), **exc.extra}
    headers = {"Retry-After": str(exc.extra["retry_after"])} if "retry_after" in exc.extra else None
    return JSONResponse(body, status_code=exc.status, headers=headers)
