"""Friends, friend requests, invite links, blocking, a friend's timetable and Compare.

All of it needs a signed-in account (deps.verified): guests get 403 verify_required, except the
invite preview, so a guest who opens an invite link sees who invited them before signing in."""
import datetime as dt
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from . import config, db, friends, logic, redisx, schedule
from .deps import Ctx, auth, etag_json, parse_day, verified
from .errors import ApiError

router = APIRouter(prefix="/api/v1", tags=["friends"])

INVITE_DAYS = 30
# No 0/O, 1/I/L: readable when someone types it over
INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _user_card(u: dict) -> dict:
    return {"id": u["id"], "display_name": u["display_name"], "avatar_color": u["avatar_color"],
            "school_id": u["school_id"]}


# ---- Friends ---------------------------------------------------------------------

@router.get("/friends")
def list_friends(ctx: Ctx = Depends(verified)):
    return {"friends": [friends.friend_out(m) for m in friends.visible_friends(ctx.uid)]}


class VisibilityIn(BaseModel):
    visibility: Literal["full", "freebusy"]


@router.patch("/friends/{friend_id}")
def set_visibility(friend_id: int, body: VisibilityIn, ctx: Ctx = Depends(verified)):
    """What I show this friend: my full timetable, or only when I'm free/busy."""
    if friends.friendship(ctx.uid, friend_id) is None:
        raise ApiError(404, "not_friends")
    db.run("UPDATE friendships SET visibility=%s WHERE user_id=%s AND friend_id=%s", (body.visibility, ctx.uid, friend_id))
    return {"friend": friends.friend_out(friends.friendship(ctx.uid, friend_id))}


@router.delete("/friends/{friend_id}", status_code=204)
def remove_friend(friend_id: int, ctx: Ctx = Depends(verified)):
    with db.tx() as c:
        friends.disconnect(c, ctx.uid, friend_id)
    return Response(status_code=204)


# ---- Friend requests -------------------------------------------------------------

class RequestIn(BaseModel):
    user_id: int


def _requests(user_id: int) -> dict:
    rows = db.rows(
        "SELECT r.*, a.display_name AS from_name, a.avatar_color AS from_color, b.display_name AS to_name, "
        "b.avatar_color AS to_color FROM friend_requests r JOIN users a ON a.id=r.from_id JOIN users b ON b.id=r.to_id "
        "WHERE r.status='pending' AND (r.from_id=%s OR r.to_id=%s) ORDER BY r.id DESC", (user_id, user_id))
    out = {"incoming": [], "outgoing": []}
    for r in rows:
        if r["to_id"] == user_id:
            out["incoming"].append({"id": r["id"], "user": {"id": r["from_id"], "display_name": r["from_name"],
                                                            "avatar_color": r["from_color"]}})
        else:
            out["outgoing"].append({"id": r["id"], "user": {"id": r["to_id"], "display_name": r["to_name"],
                                                            "avatar_color": r["to_color"]}})
    return out


@router.get("/friends/requests")
def requests(ctx: Ctx = Depends(verified)):
    return _requests(ctx.uid)


@router.post("/friends/requests", status_code=201)
def send_request(body: RequestIn, ctx: Ctx = Depends(verified)):
    """Ask someone from your school to be friends (they still have to accept)."""
    redisx.rate_limit(f"friend-request:{ctx.uid}", 30, 3600)
    other = db.one("SELECT * FROM users WHERE id=%s", (body.user_id,))
    # Only within your own school: no searching strangers elsewhere
    if (other is None or other["id"] == ctx.uid or other["is_guest"] or not ctx.user["school_id"]
            or other["school_id"] != ctx.user["school_id"]):
        raise ApiError(404, "not_found")
    with db.tx() as c:
        if friends.blocked_between(ctx.uid, other["id"], c):
            # Same answer as success: someone who blocked you shouldn't be detectable
            return _requests(ctx.uid)
        if db.one("SELECT 1 AS x FROM friendships WHERE user_id=%s AND friend_id=%s", (ctx.uid, other["id"]), c):
            return _requests(ctx.uid)
        reverse = db.one("SELECT id FROM friend_requests WHERE from_id=%s AND to_id=%s AND status='pending' FOR UPDATE",
                         (other["id"], ctx.uid), c)
        if reverse:
            friends.connect(c, ctx.uid, other["id"])
        elif db.one("SELECT id FROM friend_requests WHERE from_id=%s AND to_id=%s AND status='pending'",
                    (ctx.uid, other["id"]), c):
            raise ApiError(409, "request_exists")
        else:
            db.run("INSERT INTO friend_requests (from_id, to_id) VALUES (%s,%s)", (ctx.uid, other["id"]), c)
    return _requests(ctx.uid)


@router.post("/friends/requests/{request_id}/{action}")
def answer_request(request_id: int, action: Literal["accept", "decline", "cancel"], ctx: Ctx = Depends(verified)):
    with db.tx() as c:
        r = db.one("SELECT * FROM friend_requests WHERE id=%s AND status='pending' FOR UPDATE", (request_id,), c)
        mine_to_answer = r is not None and r["to_id"] == ctx.uid and action in ("accept", "decline")
        mine_to_cancel = r is not None and r["from_id"] == ctx.uid and action == "cancel"
        if not (mine_to_answer or mine_to_cancel):
            raise ApiError(404, "not_found")
        if action == "accept":
            friends.connect(c, r["from_id"], r["to_id"])
        else:
            db.run("UPDATE friend_requests SET status=%s, decided_at=UTC_TIMESTAMP() WHERE id=%s",
                   ("declined" if action == "decline" else "cancelled", request_id), c)
    return _requests(ctx.uid)


@router.get("/classmates")
def classmates(ctx: Ctx = Depends(verified)):
    """People who follow one of your classes and aren't your friends yet (onboarding: "Klasgenoten al op
    Roosters+"). Only within your school; people who blocked you, or whom you blocked, never show up."""
    rows = db.rows(
        "SELECT u.id, u.display_name, u.avatar_color, GROUP_CONCAT(DISTINCT sc.name ORDER BY sc.name SEPARATOR ',') "
        "AS classes FROM sources mine JOIN sources theirs ON theirs.school_class_id=mine.school_class_id "
        "AND theirs.deleted_at IS NULL AND theirs.user_id<>mine.user_id JOIN users u ON u.id=theirs.user_id "
        "JOIN school_classes sc ON sc.id=mine.school_class_id "
        "WHERE mine.user_id=%s AND mine.deleted_at IS NULL AND mine.kind='untis' AND u.school_id=%s AND u.is_guest=0 "
        "AND NOT EXISTS (SELECT 1 FROM friendships f WHERE f.user_id=%s AND f.friend_id=u.id) "
        "AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.user_id=%s AND b.blocked_id=u.id) "
        "OR (b.user_id=u.id AND b.blocked_id=%s)) "
        "GROUP BY u.id, u.display_name, u.avatar_color ORDER BY u.display_name LIMIT 200",
        (ctx.uid, ctx.user["school_id"], ctx.uid, ctx.uid, ctx.uid))
    asked = {r["to_id"] for r in db.rows("SELECT to_id FROM friend_requests WHERE from_id=%s AND status='pending'",
                                         (ctx.uid,))}
    return {"classmates": [{"id": r["id"], "display_name": r["display_name"], "avatar_color": r["avatar_color"],
                            "classes": (r["classes"] or "").split(",") if r["classes"] else [],
                            "requested": r["id"] in asked} for r in rows]}


# ---- Invite links ----------------------------------------------------------------

def _invite_out(inv: dict) -> dict:
    return {"code": inv["code"], "url": f"{config.PUBLIC_URL}/i/{inv['code']}",
            "expires_at": inv["expires_at"].isoformat() + "Z", "uses": inv["uses"], "max_uses": inv["max_uses"]}


def _new_code() -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(8))


@router.post("/invites")
def my_invite(ctx: Ctx = Depends(verified), reset: bool = False):
    """Your invite link (the same one until it expires; reset=true makes a new one and stops the old)."""
    with db.tx() as c:
        if reset:
            db.run("UPDATE invites SET revoked_at=UTC_TIMESTAMP() WHERE user_id=%s AND revoked_at IS NULL", (ctx.uid,), c)
        inv = db.one("SELECT * FROM invites WHERE user_id=%s AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP() "
                     "AND uses < max_uses ORDER BY id DESC LIMIT 1", (ctx.uid,), c)
        if inv is None:
            for _ in range(5):
                code = _new_code()
                if not db.one("SELECT id FROM invites WHERE code=%s", (code,), c):
                    break
            db.run("INSERT INTO invites (user_id, code, expires_at) VALUES (%s,%s,%s)",
                   (ctx.uid, code, db.utcnow() + dt.timedelta(days=INVITE_DAYS)), c)
            inv = db.one("SELECT * FROM invites WHERE code=%s", (code,), c)
    return {"invite": _invite_out(inv)}


def _valid_invite(code: str, c=None) -> dict:
    inv = db.one("SELECT i.*, u.display_name, u.avatar_color, u.school_id FROM invites i JOIN users u ON u.id=i.user_id "
                 "WHERE i.code=%s AND i.revoked_at IS NULL AND i.expires_at > UTC_TIMESTAMP() AND i.uses < i.max_uses",
                 ((code or "").strip().upper(),), c)
    if inv is None:
        raise ApiError(404, "invite_invalid")
    return inv


@router.get("/invites/{code}")
def invite_preview(code: str, ctx: Ctx = Depends(auth)):
    redisx.rate_limit(f"invite-look:{ctx.uid}", 60, 3600)
    inv = _valid_invite(code)
    return {"inviter": {"id": inv["user_id"], "display_name": inv["display_name"], "avatar_color": inv["avatar_color"],
                        "school_id": inv["school_id"]},
            "already_friends": bool(db.one("SELECT 1 AS x FROM friendships WHERE user_id=%s AND friend_id=%s",
                                           (ctx.uid, inv["user_id"])))}


@router.post("/invites/{code}/accept")
def accept_invite(code: str, ctx: Ctx = Depends(verified)):
    redisx.rate_limit(f"invite-accept:{ctx.uid}", 30, 3600)
    with db.tx() as c:
        inv = _valid_invite(code, c)
        if inv["user_id"] == ctx.uid:
            raise ApiError(400, "invite_self")
        already = db.one("SELECT 1 AS x FROM friendships WHERE user_id=%s AND friend_id=%s", (ctx.uid, inv["user_id"]), c)
        if not already:
            friends.connect(c, inv["user_id"], ctx.uid)
            db.run("UPDATE invites SET uses=uses+1 WHERE id=%s", (inv["id"],), c)
    return {"friend": friends.friend_out(friends.friendship(ctx.uid, inv["user_id"]))}


# ---- Blocking --------------------------------------------------------------------

@router.get("/blocks")
def blocks(ctx: Ctx = Depends(verified)):
    return {"blocked": [_user_card(u) for u in db.rows(
        "SELECT u.* FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.user_id=%s ORDER BY u.display_name",
        (ctx.uid,))]}


@router.post("/blocks", status_code=201)
def block(body: RequestIn, ctx: Ctx = Depends(verified)):
    """Blocking ends the friendship and open requests; they can't send you new ones."""
    if body.user_id == ctx.uid or not db.one("SELECT id FROM users WHERE id=%s", (body.user_id,)):
        raise ApiError(404, "not_found")
    with db.tx() as c:
        db.run("INSERT IGNORE INTO blocks (user_id, blocked_id) VALUES (%s,%s)", (ctx.uid, body.user_id), c)
        friends.disconnect(c, ctx.uid, body.user_id)
        db.run("UPDATE friend_requests SET status='cancelled', decided_at=UTC_TIMESTAMP() WHERE status='pending' "
               "AND ((from_id=%s AND to_id=%s) OR (from_id=%s AND to_id=%s))",
               (ctx.uid, body.user_id, body.user_id, ctx.uid), c)
    return blocks(ctx)


@router.delete("/blocks/{user_id}", status_code=204)
def unblock(user_id: int, ctx: Ctx = Depends(verified)):
    db.run("DELETE FROM blocks WHERE user_id=%s AND blocked_id=%s", (ctx.uid, user_id))
    return Response(status_code=204)


# ---- A friend's timetable & Compare ----------------------------------------------

@router.get("/friends/{friend_id}/schedule")
def friend_schedule(friend_id: int, request: Request, start: str | None = None, days: int = 7,
                    ctx: Ctx = Depends(verified)):
    m = friends.friendship(ctx.uid, friend_id)
    if m is None:
        raise ApiError(404, "not_friends")
    today = schedule.local_now(ctx.user).date()
    first = parse_day(start, today - dt.timedelta(days=today.weekday()))
    days = max(1, min(days, 28))
    if m["hidden"]:
        return etag_json(request, {"start": first.isoformat(), "days": days, "hidden": True, "lessons": []})
    last = first + dt.timedelta(days=days - 1)
    loading = schedule.ensure_weeks([friend_id], first, last, today)
    ls = schedule.lessons([friend_id], first, last)[friend_id]
    lessons = [schedule.lesson_out(l) for l in ls] if m["visibility"] == "full" else schedule.busy_only(ls)
    return etag_json(request, {"start": first.isoformat(), "days": days, "hidden": False, "loading": loading,
                               "visibility": m["visibility"], "lessons": lessons})


@router.get("/compare")
def compare(request: Request, ids: str, day: str | None = None, ctx: Ctx = Depends(verified)):
    """You + up to 3 friends (more = Premium, later): when are you free together?"""
    try:
        wanted = list(dict.fromkeys(int(x) for x in ids.split(",") if x.strip()))
    except ValueError:
        raise ApiError(400, "invalid")
    wanted = [x for x in wanted if x != ctx.uid]
    if len(wanted) > config.MAX_COMPARE_FREE:
        raise ApiError(402, "compare_limit", limit=config.MAX_COMPARE_FREE)
    mates = {m["user"]["id"]: m for m in friends.visible_friends_of(ctx.uid, wanted) if not m["hidden"]}
    d = parse_day(day, schedule.local_now(ctx.user).date())
    users = [ctx.user] + [mates[x]["user"] for x in wanted if x in mates]
    people = schedule.person_days(users, d)
    infos = {pid: logic.day_info(p) for pid, p in people.items()}
    order = [people[u["id"]] for u in users]
    rows = []
    for u in users:
        info = infos[u["id"]]
        rows.append({"id": u["id"], "present": info.present, "free": [[s, e] for s, e in info.free],
                     "busy": [[s, e] for s, e in info.busy]})
    return etag_json(request, {
        "day": d.isoformat(),
        "people": rows,
        "missing": [x for x in wanted if x not in mates],
        "matches": logic.compare_matches(order, infos),
    })
