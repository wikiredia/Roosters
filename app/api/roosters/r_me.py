"""Your own account: profile, timetable sources, your schedule, the Today screen, check-in,
notifications, data export and deleting your account."""
import datetime as dt
from typing import Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from . import accounts, config, crypto, db, friends, logic, netfetch, notifications, redisx, schedule, sync
from .deps import Ctx, auth, etag_json, parse_day
from .errors import ApiError

router = APIRouter(prefix="/api/v1/me", tags=["me"])

MAX_SOURCES = 16
SOURCE_OUT = "id, kind, label, school_class_id, config, last_sync, last_ok, last_error, created_at"


def user_out(u: dict) -> dict:
    return {"id": u["id"], "display_name": u["display_name"], "email": u["email"], "locale": u["locale"],
            "school_id": u["school_id"], "campus_id": u["campus_id"], "avatar_color": u["avatar_color"],
            "ghost_until": u["ghost_until"].isoformat() + "Z" if u["ghost_until"] else None,
            "onboarded": u["onboarded_at"] is not None, "guest": bool(u["is_guest"])}


def _ts(v):
    return v.isoformat() + "Z" if v else None


def source_out(s: dict) -> dict:
    out = {"id": s["id"], "kind": s["kind"], "label": s["label"], "config": db.unjs(s["config"], {}) or {},
           "last_ok": _ts(s.get("last_ok")), "error": s.get("last_error"), "syncing": False}
    if s["kind"] == "untis":
        out["class_id"] = s["school_class_id"]
        out["semester"] = s.get("semester")
        # The class is shared: its sync state counts
        out["last_ok"] = _ts(s.get("class_last_ok"))
        out["error"] = s.get("class_last_error")
        out["syncing"] = s.get("class_last_ok") is None and not s.get("class_last_error")
    else:
        out["syncing"] = s.get("last_ok") is None and not s.get("last_error")
    return out


def my_sources(user_id: int) -> list[dict]:
    return db.rows(
        "SELECT s.*, sc.last_ok AS class_last_ok, sc.last_error AS class_last_error FROM sources s "
        "LEFT JOIN school_classes sc ON sc.id=s.school_class_id WHERE s.user_id=%s AND s.deleted_at IS NULL "
        "ORDER BY s.id", (user_id,))


# ---- Profile ---------------------------------------------------------------------

class ProfileIn(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=60)
    locale: Literal["nl", "en"] | None = None
    school_id: int | None = None
    campus_id: int | None = None
    avatar_color: int | None = Field(None, ge=0, le=7)
    onboarded: bool | None = None


@router.get("")
def me(ctx: Ctx = Depends(auth)):
    return {"user": user_out(ctx.user)}


@router.patch("")
def update_me(body: ProfileIn, ctx: Ctx = Depends(auth)):
    fields = body.model_dump(exclude_unset=True)
    sets, args = [], []
    if "display_name" in fields:
        name = (fields["display_name"] or "").strip()
        if not name:
            raise ApiError(400, "invalid")
        sets.append("display_name=%s")
        args.append(name)
    for key in ("locale", "avatar_color"):
        if fields.get(key) is not None:
            sets.append(f"{key}=%s")
            args.append(fields[key])
    school_id = fields.get("school_id", ctx.user["school_id"])
    if "school_id" in fields:
        if school_id is not None and not db.one("SELECT id FROM schools WHERE id=%s AND active=1", (school_id,)):
            raise ApiError(400, "school_unknown")
        sets.append("school_id=%s")
        args.append(school_id)
        if school_id != ctx.user["school_id"] and "campus_id" not in fields:
            sets.append("campus_id=NULL")
    if "campus_id" in fields:
        campus_id = fields["campus_id"]
        if campus_id is not None and not db.one("SELECT id FROM campuses WHERE id=%s AND school_id=%s",
                                                (campus_id, school_id)):
            raise ApiError(400, "campus_unknown")
        sets.append("campus_id=%s")
        args.append(campus_id)
    if fields.get("onboarded") and ctx.user["onboarded_at"] is None:
        sets.append("onboarded_at=UTC_TIMESTAMP()")
    if sets:
        db.run(f"UPDATE users SET {', '.join(sets)} WHERE id=%s", (*args, ctx.uid))
    return {"user": user_out(db.one("SELECT * FROM users WHERE id=%s", (ctx.uid,)))}


class GhostIn(BaseModel):
    # minutes from now; 0 = visible again; -1 = until you turn it off
    minutes: int = Field(ge=-1, le=60 * 24 * 365)


@router.put("/ghost")
def ghost(body: GhostIn, ctx: Ctx = Depends(auth)):
    if body.minutes == 0:
        until = None
    elif body.minutes < 0:
        until = dt.datetime(9999, 12, 31)
    else:
        until = db.utcnow() + dt.timedelta(minutes=body.minutes)
    db.run("UPDATE users SET ghost_until=%s WHERE id=%s", (until, ctx.uid))
    return {"user": user_out(db.one("SELECT * FROM users WHERE id=%s", (ctx.uid,)))}


# ---- Timetable sources -----------------------------------------------------------

class UntisSourceIn(BaseModel):
    class_id: int
    # 1 or 2: you follow this class in that semester only; None: the whole school year
    semester: Literal[1, 2] | None = None
    include: list[str] = Field(default_factory=list, max_length=200)
    exclude: list[str] = Field(default_factory=list, max_length=200)


class IcsSourceIn(BaseModel):
    url: str = Field(max_length=2000)
    label: str | None = Field(None, max_length=160)
    keywords: list[str] = Field(default_factory=list, max_length=50)


class SourceConfigIn(BaseModel):
    include: list[str] | None = Field(None, max_length=200)
    # True: `include` is exactly the courses you follow (picked one by one; empty = none of them)
    picked: bool | None = None
    exclude: list[str] | None = Field(None, max_length=200)
    keywords: list[str] | None = Field(None, max_length=50)
    label: str | None = Field(None, max_length=160)


def _clean(xs) -> list[str]:
    return sorted({x.strip()[:200] for x in xs or [] if x and x.strip()})


@router.get("/sources")
def sources(ctx: Ctx = Depends(auth)):
    return {"sources": [source_out(s) for s in my_sources(ctx.uid)]}


@router.post("/sources/untis", status_code=201)
def add_untis(body: UntisSourceIn, ctx: Ctx = Depends(auth)):
    if not ctx.user["school_id"]:
        raise ApiError(400, "school_required")
    cls = db.one("SELECT * FROM school_classes WHERE id=%s AND school_id=%s AND active=1",
                 (body.class_id, ctx.user["school_id"]))
    if cls is None:
        raise ApiError(400, "class_unknown")
    with db.tx() as c:
        mine = db.rows("SELECT school_class_id, semester FROM sources WHERE user_id=%s AND deleted_at IS NULL "
                       "FOR UPDATE", (ctx.uid,), c)
        # The same class in S1 and in S2 are two sources (each with its own courses); all year overlaps both
        if any(s["school_class_id"] == cls["id"] and (s["semester"] is None or body.semester is None
                                                      or s["semester"] == body.semester) for s in mine):
            raise ApiError(409, "source_exists")
        if len(mine) >= MAX_SOURCES:
            raise ApiError(400, "source_limit")
        cfg = {"include": _clean(body.include), "exclude": _clean(body.exclude)}
        sid = db.run("INSERT INTO sources (user_id, kind, label, school_class_id, semester, config) "
                     "VALUES (%s,'untis',%s,%s,%s,%s)", (ctx.uid, cls["name"], cls["id"], body.semester, db.js(cfg)), c)
        # Never fetched or stale: fetch now, ahead of the routine syncs (the "aha" moment in onboarding)
        fresh = cls["last_ok"] and db.utcnow() - cls["last_ok"] < dt.timedelta(minutes=config.SYNC_EVERY_DAY)
        if not fresh:
            sync.queue_class(cls["id"], soon=True, c=c)
        if cls["courses_scanned_at"] is None:
            sync.queue_scan(cls["id"], c=c)
    s = next(x for x in my_sources(ctx.uid) if x["id"] == sid)
    return {"source": source_out(s)}


@router.post("/sources/ics", status_code=201)
def add_ics(body: IcsSourceIn, ctx: Ctx = Depends(auth)):
    url = netfetch.normalize_url(body.url)
    try:
        parts = netfetch.check_url(url)
    except netfetch.FetchError:
        raise ApiError(400, "link_invalid")
    with db.tx() as c:
        n = db.one("SELECT COUNT(*) AS n FROM sources WHERE user_id=%s AND deleted_at IS NULL FOR UPDATE",
                   (ctx.uid,), c)["n"]
        if n >= MAX_SOURCES:
            raise ApiError(400, "source_limit")
        label = (body.label or "").strip() or parts.hostname
        sid = db.run("INSERT INTO sources (user_id, kind, label, config, secret_enc) VALUES (%s,'ics',%s,%s,%s)",
                     (ctx.uid, label[:160], db.js({"keywords": _clean(body.keywords)}), crypto.encrypt(url)), c)
        sync.queue_source(sid, soon=True, c=c)
    s = next(x for x in my_sources(ctx.uid) if x["id"] == sid)
    return {"source": source_out(s)}


@router.patch("/sources/{source_id}")
def update_source(source_id: int, body: SourceConfigIn, ctx: Ctx = Depends(auth)):
    s = db.one("SELECT * FROM sources WHERE id=%s AND user_id=%s AND deleted_at IS NULL", (source_id, ctx.uid))
    if s is None:
        raise ApiError(404, "not_found")
    cfg = db.unjs(s["config"], {}) or {}
    fields = body.model_dump(exclude_unset=True)
    keys = ("include", "exclude") if s["kind"] == "untis" else ("keywords",)
    for k in keys:
        if fields.get(k) is not None:
            cfg[k] = _clean(fields[k])
    if s["kind"] == "untis" and fields.get("picked") is not None:
        cfg["picked"] = bool(fields["picked"])
    label = (fields.get("label") or "").strip() or s["label"]
    db.run("UPDATE sources SET config=%s, label=%s WHERE id=%s", (db.js(cfg), label[:160], source_id))
    if s["kind"] == "ics" and "keywords" in fields:
        sync.queue_source(source_id, soon=True)
    return {"source": source_out(next(x for x in my_sources(ctx.uid) if x["id"] == source_id))}


@router.delete("/sources/{source_id}", status_code=204)
def delete_source(source_id: int, ctx: Ctx = Depends(auth)):
    with db.tx() as c:
        n = db.run("UPDATE sources SET deleted_at=UTC_TIMESTAMP(), secret_enc=NULL WHERE id=%s AND user_id=%s "
                   "AND deleted_at IS NULL", (source_id, ctx.uid), c)
        db.run("DELETE FROM source_lessons WHERE source_id=%s AND user_id=%s", (source_id, ctx.uid), c)
    if not n:
        raise ApiError(404, "not_found")
    return Response(status_code=204)


@router.post("/refresh", status_code=202)
def refresh(ctx: Ctx = Depends(auth)):
    """'Refresh' button: fetch my classes and links again (not more often than every 90 s)."""
    if not redisx.hit(f"refresh:{ctx.uid}", 1, config.REFRESH_COOLDOWN):
        raise ApiError(429, "refresh_cooldown", retry_after=config.REFRESH_COOLDOWN)
    for s in my_sources(ctx.uid):
        if s["kind"] == "untis":
            sync.queue_class(s["school_class_id"], soon=True)
        else:
            sync.queue_source(s["id"], soon=True)
    return {"queued": True}


class HiddenIn(BaseModel):
    course: str = Field(min_length=1, max_length=200)
    hidden: bool


@router.put("/hidden-courses")
def hide_course(body: HiddenIn, ctx: Ctx = Depends(auth)):
    if body.hidden:
        db.run("INSERT IGNORE INTO hidden_courses (user_id, course) VALUES (%s,%s)", (ctx.uid, body.course.strip()))
    else:
        db.run("DELETE FROM hidden_courses WHERE user_id=%s AND course=%s", (ctx.uid, body.course.strip()))
    return {"hidden": [r["course"] for r in db.rows("SELECT course FROM hidden_courses WHERE user_id=%s ORDER BY course",
                                                    (ctx.uid,))]}


# ---- Schedule & Today ------------------------------------------------------------

@router.get("/schedule")
def my_schedule(request: Request, start: str | None = None, days: int = 7, ctx: Ctx = Depends(auth)):
    today = schedule.local_now(ctx.user).date()
    first = parse_day(start, today - dt.timedelta(days=today.weekday()))
    days = max(1, min(days, 28))
    last = first + dt.timedelta(days=days - 1)
    # Far back or ahead: fetched from Untis now; `loading` until it's there (the app asks again)
    loading = schedule.ensure_weeks([ctx.uid], first, last, today)
    ls = schedule.lessons([ctx.uid], first, last)[ctx.uid]
    return etag_json(request, {"start": first.isoformat(), "days": days, "loading": loading,
                               "lessons": [schedule.lesson_out(l) for l in ls], "sources": sources_state(ctx.uid)})


def sources_state(user_id: int) -> dict:
    srcs = [source_out(s) for s in my_sources(user_id)]
    oks = [s["last_ok"] for s in srcs if s["last_ok"]]
    return {"count": len(srcs), "updated_at": min(oks) if oks else None,
            "syncing": any(s["syncing"] for s in srcs), "errors": [s["id"] for s in srcs if s["error"]]}


@router.get("/today")
def today(request: Request, day: str | None = None, ctx: Ctx = Depends(auth)):
    """Everything the Today screen needs in one request (slow wifi: one round trip, with ETag)."""
    now_dt = schedule.local_now(ctx.user)
    d = parse_day(day, now_dt.date())
    now = now_dt.hour * 60 + now_dt.minute if d == now_dt.date() else 0
    loading = schedule.ensure_weeks([ctx.uid], d, d, now_dt.date())
    mates = friends.visible_friends(ctx.uid)
    people = schedule.person_days([ctx.user] + [m["user"] for m in mates], d)
    infos = {pid: logic.day_info(p) for pid, p in people.items()}
    me = people[ctx.uid]
    my_lessons = schedule.lessons([ctx.uid], d, d)[ctx.uid]
    board = []
    for m in mates:
        f = m["user"]
        if m["hidden"]:
            board.append({"id": f["id"], "status": {"code": "hidden"}})
            continue
        board.append({"id": f["id"], "status": schedule.status(people[f["id"]], infos[f["id"]], now)})
    order = {"break": 0, "chilling": 1, "wants_to_chill": 1, "in_class": 2, "later": 3, "done": 4, "home": 5,
             "absent": 6, "no_classes": 7, "hidden": 8}
    board.sort(key=lambda x: (order.get(x["status"]["code"], 9), x["status"].get("until") or 0))
    hidden = {m["user"]["id"] for m in mates if m["hidden"]}
    visible = {pid: p for pid, p in people.items() if pid not in hidden}
    together = logic.partners(me, visible, infos, after=now)
    changes = [n for n in notifications.list_for(ctx.uid, limit=20)
               if n["kind"] == "schedule_change" and n["day"] and n["day"] >= d.isoformat()]
    checkin = db.one("SELECT status, since_min, until_min FROM checkins WHERE user_id=%s AND day=%s", (ctx.uid, d))
    return etag_json(request, {
        "day": d.isoformat(), "now": now, "loading": loading,
        "me": {"status": schedule.status(me, infos[ctx.uid], now), "checkin": checkin,
               "lessons": [schedule.lesson_out(l) for l in my_lessons]},
        "friends": [friends.friend_out(m) for m in mates],
        "board": board,
        "together": together,
        "changes": changes,
        "sources": sources_state(ctx.uid),
    })


class CheckinIn(BaseModel):
    status: Literal["chilling", "want_chill", "home", "absent"] | None
    until_min: int | None = Field(None, ge=0, le=24 * 60)


@router.put("/checkin")
def checkin(body: CheckinIn, ctx: Ctx = Depends(auth)):
    now_dt = schedule.local_now(ctx.user)
    d, now = now_dt.date(), now_dt.hour * 60 + now_dt.minute
    if body.status is None:
        db.run("DELETE FROM checkins WHERE user_id=%s AND day=%s", (ctx.uid, d))
        return {"checkin": None}
    db.run("INSERT INTO checkins (user_id, day, status, since_min, until_min) VALUES (%s,%s,%s,%s,%s) "
           "ON DUPLICATE KEY UPDATE status=VALUES(status), since_min=VALUES(since_min), until_min=VALUES(until_min), "
           "updated_at=UTC_TIMESTAMP()", (ctx.uid, d, body.status, now, body.until_min))
    return {"checkin": {"status": body.status, "since_min": now, "until_min": body.until_min}}


# ---- Notifications ---------------------------------------------------------------

@router.get("/notifications")
def my_notifications(after: int = 0, ctx: Ctx = Depends(auth)):
    return {"notifications": notifications.list_for(ctx.uid, after_id=after)}


class ReadIn(BaseModel):
    up_to_id: int


@router.post("/notifications/read", status_code=204)
def read(body: ReadIn, ctx: Ctx = Depends(auth)):
    notifications.mark_read(ctx.uid, body.up_to_id)
    return Response(status_code=204)


# ---- Your data -------------------------------------------------------------------

@router.get("/export")
def export(ctx: Ctx = Depends(auth)):
    """Everything we store about you (GDPR art. 15/20), as JSON."""
    uid = ctx.uid
    secret_free = [{k: v for k, v in s.items() if k != "secret_enc"}
                   for s in db.rows("SELECT * FROM sources WHERE user_id=%s", (uid,))]
    return {
        "user": db.one("SELECT * FROM users WHERE id=%s", (uid,)),
        "sign_in_methods": db.rows("SELECT provider, email, created_at, last_used_at FROM auth_identities "
                                   "WHERE user_id=%s", (uid,)),
        "sessions": db.rows("SELECT device_name, platform, created_at, last_used_at, revoked_at FROM sessions "
                            "WHERE user_id=%s", (uid,)),
        "sources": secret_free,
        "hidden_courses": db.rows("SELECT course FROM hidden_courses WHERE user_id=%s", (uid,)),
        "friends": db.rows("SELECT f.friend_id, u.display_name, f.visibility, f.created_at FROM friendships f "
                           "JOIN users u ON u.id=f.friend_id WHERE f.user_id=%s", (uid,)),
        "blocked": db.rows("SELECT blocked_id, created_at FROM blocks WHERE user_id=%s", (uid,)),
        "checkins": db.rows("SELECT * FROM checkins WHERE user_id=%s", (uid,)),
        "notifications": db.rows("SELECT kind, payload, day, created_at, read_at FROM notifications WHERE user_id=%s",
                                 (uid,)),
        "personal_calendar_lessons": db.rows("SELECT day, start_min, end_min, course, location, state FROM source_lessons "
                                             "WHERE user_id=%s", (uid,)),
    }


@router.delete("", status_code=204)
def delete_account(ctx: Ctx = Depends(auth)):
    """Deletes your account and everything linked to it, right away (App Store + GDPR)."""
    with db.tx() as c:
        accounts.delete_user(c, ctx.uid)
    return Response(status_code=204)
