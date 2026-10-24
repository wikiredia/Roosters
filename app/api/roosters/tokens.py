"""Sessions: a short-lived access token (JWT, 15 min) and a long-lived refresh token that rotates.

The app keeps both in the phone's secure storage and sends `Authorization: Bearer <access>`.
Only hashes of refresh tokens are stored."""
import datetime as dt
import time

import jwt

from . import config, crypto, db
from .errors import ApiError

ALG = "HS256"
# The previous refresh token is a retry after a lost answer (bad wifi, the app closed or reloaded while
# refreshing) for as long as the newer pair was never used, and always for this long after a rotation.
# Only an old token showing up after the phone already used the newer one means a copy is elsewhere.
REUSE_GRACE = dt.timedelta(minutes=2)


def _key() -> bytes:
    return crypto.derived_key("access-token")


def _refresh_hash(token: str) -> str:
    return crypto.keyed_hash("refresh-token", token)


def access_token(user_id: int, session_id: int, gen: int = 0) -> str:
    now = int(time.time())
    return jwt.encode({"sub": str(user_id), "sid": session_id, "gen": gen, "iat": now,
                       "exp": now + config.ACCESS_TTL, "typ": "access"}, _key(), algorithm=ALG)


def decode_access(token: str) -> tuple[int, int, int | None]:
    """-> (user_id, session_id, refresh generation or None for tokens from before generations). Raises ApiError 401."""
    try:
        claims = jwt.decode(token, _key(), algorithms=[ALG], options={"require": ["exp", "sub", "sid"]})
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "auth_expired")
    except jwt.InvalidTokenError:
        raise ApiError(401, "auth_required")
    if claims.get("typ") != "access":
        raise ApiError(401, "auth_required")
    gen = claims.get("gen")
    return int(claims["sub"]), int(claims["sid"]), gen if isinstance(gen, int) else None


def user_from_header(authorization: str | None) -> int | None:
    """User id from a valid Authorization header, or None. Does not check the session in the database."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return decode_access(authorization[7:].strip())[0]
    except ApiError:
        return None


def _bundle(user_id: int, session_id: int, refresh: str, gen: int = 0) -> dict:
    return {"access_token": access_token(user_id, session_id, gen), "refresh_token": refresh,
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
    """Swaps a refresh token for a new pair. Raises ApiError 401 (with `reason` when the session has ended)."""
    h = _refresh_hash(token or "")
    now = db.utcnow()
    with db.tx() as c:
        s = db.one("SELECT * FROM sessions WHERE refresh_hash=%s FOR UPDATE", (h,), c)
        current = s is not None
        if s is None:
            s = db.one("SELECT * FROM sessions WHERE prev_refresh_hash=%s FOR UPDATE", (h,), c)
            if s is None:
                raise ApiError(401, "auth_required", reason="unknown_token")
        if s["revoked_at"] is not None:
            raise ApiError(401, "auth_expired", reason=s["revoked_reason"] or "revoked")
        if s["expires_at"] < now:
            raise ApiError(401, "auth_expired", reason="expired")
        if not current and s["seen_gen"] >= s["gen"] and s["rotated_at"] and now - s["rotated_at"] > REUSE_GRACE:
            # The phone already used the newer pair, and now the old token shows up: someone else has a copy
            db.run("UPDATE sessions SET revoked_at=%s, revoked_reason='reuse' WHERE id=%s", (now, s["id"]), c)
            c.commit()
            raise ApiError(401, "auth_required", reason="reuse")
        new = crypto.token(32)
        gen = s["gen"] + 1
        # Keep the token that was used as 'previous', unless this was itself a retry with the previous one.
        # Using the current token proves the phone has that generation.
        prev = s["refresh_hash"] if current else s["prev_refresh_hash"]
        seen = max(s["seen_gen"], s["gen"]) if current else s["seen_gen"]
        db.run("UPDATE sessions SET refresh_hash=%s, prev_refresh_hash=%s, rotated_at=%s, gen=%s, seen_gen=%s, "
               "last_used_at=%s, expires_at=%s WHERE id=%s",
               (_refresh_hash(new), prev, now, gen, seen, now, now + dt.timedelta(days=config.REFRESH_TTL_DAYS),
                s["id"]), c)
    return _bundle(s["user_id"], s["id"], new, gen)


def saw(session_id: int, gen: int | None, s: dict):
    """A request with an access token of the session's newest generation: the phone has the newest pair."""
    if gen is not None and gen == s["gen"] and s["seen_gen"] < gen:
        db.run("UPDATE sessions SET seen_gen=%s WHERE id=%s AND seen_gen < %s", (gen, session_id, gen))


def revoke(session_id: int, reason: str = "logout"):
    db.run("UPDATE sessions SET revoked_at=UTC_TIMESTAMP(), revoked_reason=%s WHERE id=%s AND revoked_at IS NULL",
           (reason, session_id))


def revoke_all(user_id: int, reason: str = "logout_all", c=None):
    db.run("UPDATE sessions SET revoked_at=UTC_TIMESTAMP(), revoked_reason=%s WHERE user_id=%s AND revoked_at IS NULL",
           (reason, user_id), c)
