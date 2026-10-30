"""Troubleshooting and test endpoints. They answer 404 unless ENV=dev, or the owner's account is signed in
(`debug.allowed`, config.DEBUG_EMAIL): then they work on every server, production too.

Besides the mail checks: test people with a made-up timetable (testdata.py) and switching to them (`login_as`), so
you can see what a friend sees. Signed in like everything else (`deps.auth`), and only ever about your own account
and the test people it made: never another real account."""
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from . import accounts, config, db, debug, friends, push, redisx, schedule, testdata, tokens
from .deps import Ctx, auth, lang, optional_auth
from .errors import ApiError
from .r_auth import Device, _answer, _client_ip, _sign_in

router = APIRouter(prefix="/api/v1/debug", tags=["debug"])


def dev_only(ctx: Ctx | None = Depends(optional_auth)):
    """ENV=dev (anyone, also before signing in: the app's Server & debug screen), or the owner's account anywhere.
    Anyone else gets a 404, as if there were no debug endpoints."""
    if not (config.DEV or debug.allowed(ctx.user if ctx else None)):
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


@router.post("/push", dependencies=[Depends(dev_only)])
def test_push(ctx: Ctx = Depends(auth)):
    """A push to every phone you're signed in on, right away. -> {"devices": how many}"""
    redisx.rate_limit(f"debug-push:{ctx.uid}", 20, 3600)
    return {"devices": push.send_test(ctx.uid, ctx.user["locale"]), "mode": config.PUSH_MODE}


# ---- Your test people ---------------------------------------------------------------

def _yours(ctx: Ctx) -> list[int]:
    """Your real account and the test people it made (also when you're switched to one of them right now)."""
    owner = testdata.owner_of(ctx.user)
    return [owner] + testdata.mine(owner)


def _one_of_yours(ctx: Ctx, user_id: int) -> dict:
    """That account, if it's yours (see `_yours`); anyone else is a 404, as if it didn't exist."""
    u = db.one("SELECT u.*, s.tz FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE u.id=%s", (user_id,))
    if u is None or user_id not in _yours(ctx):
        raise ApiError(404, "not_found")
    return u


@router.get("/users", dependencies=[Depends(dev_only)])
def users(ctx: Ctx = Depends(auth)):
    """Your real account and your test people: who they are, and whether they're friends with whoever you are now.
    `me`: the account this request comes from; `owner`: your real account."""
    mine = {m["user"]["id"]: m for m in friends.visible_friends(ctx.uid)}
    ph, args = db.in_list(_yours(ctx))
    rows = db.rows("SELECT u.id, u.display_name, u.email, u.is_guest, u.avatar_color, u.school_id, u.campus_id, "
                   "u.onboarded_at, u.test_owner_id, s.short_name AS school, "
                   "(SELECT COUNT(*) FROM friendships f WHERE f.user_id=u.id) AS friends "
                   f"FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE u.id IN ({ph}) ORDER BY u.id", args)
    return {"me": ctx.uid, "owner": testdata.owner_of(ctx.user), "users": [{
        "id": r["id"], "display_name": r["display_name"], "email": r["email"], "guest": bool(r["is_guest"]),
        "test": r["test_owner_id"] is not None, "avatar_color": r["avatar_color"], "school": r["school"],
        "onboarded": r["onboarded_at"] is not None, "friends": r["friends"],
        "friend": r["id"] in mine,
        # What I show them, and what they show me (full, norooms, freebusy)
        "my_visibility": mine[r["id"]]["my_visibility"] if r["id"] in mine else None,
        "their_visibility": mine[r["id"]]["visibility"] if r["id"] in mine else None,
    } for r in rows]}


class LoginAsIn(Device):
    user_id: int


@router.post("/login", dependencies=[Depends(dev_only)])
def login_as(body: LoginAsIn, request: Request, ctx: Ctx = Depends(auth)):
    """Switch to one of your test people, or back to your real account: this session signs out, and the account
    signs in through the same code as a real sign-in (its sign-in identity, a turned-off account refused, a new
    session for this device). The answer is the same as a sign-in's."""
    redisx.rate_limit(f"debug-login:{ctx.uid}", 120, 3600)
    _one_of_yours(ctx, body.user_id)
    with db.tx() as c:
        ident = db.one("SELECT * FROM auth_identities WHERE user_id=%s ORDER BY last_used_at IS NULL, last_used_at DESC "
                       "LIMIT 1", (body.user_id,), c)
        if ident:
            user_id, _ = _sign_in(c, ident["provider"], ident["subject"], ident["email"], True, None, lang(request))
        else:
            # A real account without a sign-in method of its own (started as a guest): just a session
            user_id = body.user_id
        out = _answer(user_id, False, body, c)
    tokens.revoke(ctx.session_id)
    return out


class TestUsersIn(BaseModel):
    count: int = Field(1, ge=1, le=10)
    befriend: bool = True


@router.post("/test-users", status_code=201, dependencies=[Depends(dev_only)])
def add_test_users(body: TestUsersIn, ctx: Ctx = Depends(auth)):
    """Test people of your real account at your school and campus, with a made-up timetable, friends with whoever
    you are now (unless befriend=false)."""
    return {"created": testdata.create(ctx.user, body.count, body.befriend)}


@router.delete("/test-users", dependencies=[Depends(dev_only)])
def remove_test_users(ctx: Ctx = Depends(auth)):
    """Removes your test people and everything they have (switched to one of them: that session ends with it)."""
    return {"removed": testdata.remove_all(testdata.owner_of(ctx.user))}


@router.delete("/users/{user_id}", status_code=204, dependencies=[Depends(dev_only)])
def remove_user(user_id: int, ctx: Ctx = Depends(auth)):
    """Removes one of your test people (your real account is deleted in the app, like any account)."""
    u = _one_of_yours(ctx, user_id)
    if u["test_owner_id"] is None:
        raise ApiError(404, "not_found")
    with db.tx() as c:
        accounts.delete_user(c, user_id)
    return Response(status_code=204)


@router.post("/users/{user_id}/timetable", dependencies=[Depends(dev_only)])
def give_timetable(user_id: int, ctx: Ctx = Depends(auth)):
    """A made-up timetable for your account or one of your test people: replaces an earlier test timetable, keeps
    real sources."""
    u = _one_of_yours(ctx, user_id)
    with db.tx() as c:
        n = testdata.give_timetable(c, user_id, schedule.local_now(u).date())
    return {"lessons": n}


@router.post("/test-chats", status_code=201, dependencies=[Depends(dev_only)])
def add_test_chats(ctx: Ctx = Depends(auth)):
    """A group with your test friends and a one-to-one chat with one of them, with a few messages from them."""
    return {"chats": testdata.give_chats(ctx.user)}


class FriendIn(BaseModel):
    friends: bool


@router.put("/friends/{user_id}", dependencies=[Depends(dev_only)])
def set_friend(user_id: int, body: FriendIn, ctx: Ctx = Depends(auth)):
    """Friends right away (no invite) with your real account or one of your test people, or not any more."""
    _one_of_yours(ctx, user_id)
    with db.tx() as c:
        if body.friends:
            friends.connect(c, ctx.uid, user_id)
        else:
            friends.disconnect(c, ctx.uid, user_id)
    return {"friend": body.friends}
