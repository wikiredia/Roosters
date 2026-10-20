"""Sessions: a short-lived access token (JWT, 15 min) and a long-lived refresh token that rotates.

The app keeps both in the phone's secure storage and sends `Authorization: Bearer <access>`.
Only hashes of refresh tokens are stored."""
import datetime as dt
import time

import jwt

from . import config, crypto, db
from .errors import ApiError

ALG = "HS256"
# A retry with the previous refresh token is accepted for this long (the answer with the new
# token got lost on bad wifi). Later than that, it's treated as a stolen token: session revoked.
REUSE_GRACE = dt.timedelta(minutes=2)


def _key() -> bytes:
    return crypto.derived_key("access-token")


def _refresh_hash(token: str) -> str:
    return crypto.keyed_hash("refresh-token", token)


def access_token(user_id: int, session_id: int) -> str:
    now = int(time.time())
    return jwt.encode({"sub": str(user_id), "sid": session_id, "iat": now, "exp": now + config.ACCESS_TTL,
                       "typ": "access"}, _key(), algorithm=ALG)


def decode_access(token: str) -> tuple[int, int]:
    """-> (user_id, session_id). Raises ApiError 401."""
    try:
        claims = jwt.decode(token, _key(), algorithms=[ALG], options={"require": ["exp", "sub", "sid"]})
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "auth_expired")
    except jwt.InvalidTokenError:
        raise ApiError(401, "auth_required")
    if claims.get("typ") != "access":
        raise ApiError(401, "auth_required")
    return int(claims["sub"]), int(claims["sid"])


def user_from_header(authorization: str | None) -> int | None:
    """User id from a valid Authorization header, or None. Does not check the session in the database."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return decode_access(authorization[7:].strip())[0]
    except ApiError:
        return None


def _bundle(user_id: int, session_id: int, refresh: str) -> dict:
    return {"access_token": access_token(user_id, session_id), "refresh_token": refresh,
            "token_type": "bearer", "expires_in": config.ACCESS_TTL}


def start_session(user_id: int, device_name: str | None, platform: str | None, c=None) -> dict:
    refresh = crypto.token(32)
    now = db.utcnow()
    platform = platform if platform in ("ios", "android", "web") else "other"
    sid = db.run(
        "INSERT INTO sessions (user_id, refresh_hash, device_name, platform, created_at, last_used_at, expires_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (user_id, _refresh_hash(refresh), (device_name or "")[:80] or None, platform, now, now,
         now + dt.timedelta(days=config.REFRESH_TTL_DAYS)), c)
    return _bundle(user_id, sid, refresh)


def refresh(token: str) -> dict:
    """Swaps a refresh token for a new pair. Raises ApiError 401."""
    h = _refresh_hash(token or "")
    now = db.utcnow()
    with db.tx() as c:
        s = db.one("SELECT * FROM sessions WHERE refresh_hash=%s FOR UPDATE", (h,), c)
        if s is None:
            s = db.one("SELECT * FROM sessions WHERE prev_refresh_hash=%s FOR UPDATE", (h,), c)
            if s is None:
                raise ApiError(401, "auth_required")
            if s["revoked_at"] is None and s["rotated_at"] and now - s["rotated_at"] > REUSE_GRACE:
                # An old token shows up long after it was replaced: someone else has it. End the session.
                db.run("UPDATE sessions SET revoked_at=%s WHERE id=%s", (now, s["id"]), c)
                c.commit()
                raise ApiError(401, "auth_required")
        if s["revoked_at"] is not None or s["expires_at"] < now:
            raise ApiError(401, "auth_expired")
        new = crypto.token(32)
        # Keep the token that was used as 'previous', unless this was itself a retry with the previous one
        prev = s["refresh_hash"] if s["refresh_hash"] == h else s["prev_refresh_hash"]
        db.run("UPDATE sessions SET refresh_hash=%s, prev_refresh_hash=%s, rotated_at=%s, last_used_at=%s, "
               "expires_at=%s WHERE id=%s",
               (_refresh_hash(new), prev, now, now, now + dt.timedelta(days=config.REFRESH_TTL_DAYS), s["id"]), c)
    return _bundle(s["user_id"], s["id"], new)


def revoke(session_id: int):
    db.run("UPDATE sessions SET revoked_at=UTC_TIMESTAMP() WHERE id=%s AND revoked_at IS NULL", (session_id,))


def revoke_all(user_id: int):
    db.run("UPDATE sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=%s AND revoked_at IS NULL", (user_id,))
