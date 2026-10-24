"""Troubleshooting and test endpoints for the laptop/test server. They answer 404 unless ENV=dev.

Besides the mail checks: every account at a glance, switching to any of them without signing in (`login_as`),
and test people with a made-up timetable (testdata.py), so you can see what a friend sees. Never on production:
with ENV=dev anyone who reaches the API can become anyone."""
import ipaddress

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from . import accounts, config, db, debug, friends, redisx, schedule, testdata, tokens
from .deps import Ctx, auth, optional_auth
from .errors import ApiError
from .r_auth import _client_ip

router = APIRouter(prefix="/api/v1/debug", tags=["debug"])


def dev_only():
    if not config.DEV:
        raise ApiError(404, "not_found")


class TestMailIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)


@router.get("", dependencies=[Depends(dev_only)])
def diagnose():
    """Mail settings, SMTP reachable?, worker running?, the last login mails and what to do about them."""
    return debug.diagnose()


@router.post("/mail", dependencies=[Depends(dev_only)])
def test_mail(body: TestMailIn, request: Request):
    redisx.rate_limit(f"debug-mail:{_client_ip(request)}", 10, 3600)
    return debug.send_test_mail(body.email.strip())


# ---- Accounts and test people ------------------------------------------------------

def _private(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host.strip())
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback


def local_only(request: Request):
    """A second lock on switching users and test data, should a server ever run with ENV=dev by mistake: only from
    this computer or a private network (the phone on your wifi), every hop included (the connection and every
    X-Forwarded-For address)."""
    dev_only()
    hops = [request.client.host if request.client else ""]
    hops += [h for h in (request.headers.get("x-forwarded-for") or "").split(",") if h.strip()]
    if not all(_private(h) for h in hops):
        raise ApiError(404, "not_found")

@router.get("/users", dependencies=[Depends(local_only)])
def users(ctx: Ctx | None = Depends(optional_auth)):
    """Every account (newest first, at most 200): who it is, whether it's a test person or a guest, and whether
    it's friends with you. `me`: the account this request comes from (null when signed out)."""
    mine = {m["user"]["id"]: m for m in friends.visible_friends(ctx.uid)} if ctx else {}
    rows = db.rows("SELECT u.id, u.display_name, u.email, u.is_guest, u.avatar_color, u.school_id, u.campus_id, "
                   "u.onboarded_at, s.short_name AS school, "
                   "(SELECT COUNT(*) FROM friendships f WHERE f.user_id=u.id) AS friends "
                   "FROM users u LEFT JOIN schools s ON s.id=u.school_id ORDER BY u.id DESC LIMIT 200")
    return {"me": ctx.uid if ctx else None, "users": [{
        "id": r["id"], "display_name": r["display_name"], "email": r["email"], "guest": bool(r["is_guest"]),
        "test": testdata.is_test(r), "avatar_color": r["avatar_color"], "school": r["school"],
        "onboarded": r["onboarded_at"] is not None, "friends": r["friends"],
        "friend": r["id"] in mine,
        # What I show them, and what they show me (full, norooms, freebusy)
        "my_visibility": mine[r["id"]]["my_visibility"] if r["id"] in mine else None,
        "their_visibility": mine[r["id"]]["visibility"] if r["id"] in mine else None,
    } for r in rows]}


class LoginAsIn(BaseModel):
    user_id: int


@router.post("/login", dependencies=[Depends(local_only)])
def login_as(body: LoginAsIn, request: Request):
    """Signs in as anyone, no code: a new session, the same answer as a sign-in. The app switches to it."""
    redisx.rate_limit(f"debug-login:{_client_ip(request)}", 120, 3600)
    if not db.one("SELECT id FROM users WHERE id=%s AND disabled_at IS NULL", (body.user_id,)):
        raise ApiError(404, "not_found")
    return {**tokens.start_session(body.user_id, "Debug: switched user", "other"), "is_new": False}


class TestUsersIn(BaseModel):
    count: int = Field(1, ge=1, le=10)
    befriend: bool = True


@router.post("/test-users", status_code=201, dependencies=[Depends(local_only)])
def add_test_users(body: TestUsersIn, ctx: Ctx = Depends(auth)):
    """Test people at your school and campus, with a made-up timetable, friends with you (unless befriend=false)."""
    return {"created": testdata.create(ctx.user, body.count, body.befriend)}


@router.delete("/test-users", dependencies=[Depends(local_only)])
def remove_test_users():
    """Removes every test person and everything they have."""
    return {"removed": testdata.remove_all()}


@router.delete("/users/{user_id}", status_code=204, dependencies=[Depends(local_only)])
def remove_user(user_id: int):
    """Removes one test person (real accounts are deleted by their owner, in the app)."""
    u = db.one("SELECT * FROM users WHERE id=%s", (user_id,))
    if u is None or not testdata.is_test(u):
        raise ApiError(404, "not_found")
    with db.tx() as c:
        accounts.delete_user(c, user_id)
    return Response(status_code=204)


@router.post("/users/{user_id}/timetable", dependencies=[Depends(local_only)])
def give_timetable(user_id: int):
    """A made-up timetable for any account (yours too): replaces an earlier test timetable, keeps real sources."""
    u = db.one("SELECT u.*, s.tz FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE u.id=%s", (user_id,))
    if u is None:
        raise ApiError(404, "not_found")
    with db.tx() as c:
        n = testdata.give_timetable(c, user_id, schedule.local_now(u).date())
    return {"lessons": n}


@router.post("/test-chats", status_code=201, dependencies=[Depends(local_only)])
def add_test_chats(ctx: Ctx = Depends(auth)):
    """A group with your test friends and a one-to-one chat with one of them, with a few messages from them."""
    return {"chats": testdata.give_chats(ctx.user)}


class FriendIn(BaseModel):
    friends: bool


@router.put("/friends/{user_id}", dependencies=[Depends(local_only)])
def set_friend(user_id: int, body: FriendIn, ctx: Ctx = Depends(auth)):
    """Friends with someone right away (no invite), or not any more."""
    if not db.one("SELECT id FROM users WHERE id=%s", (user_id,)):
        raise ApiError(404, "not_found")
    with db.tx() as c:
        if body.friends:
            friends.connect(c, ctx.uid, user_id)
        else:
            friends.disconnect(c, ctx.uid, user_id)
    return {"friend": body.friends}
