"""Admin API for the management console (Smart-Room console, Roosters+ tab). A separate app, never part
of the public API:

    uvicorn roosters.admin:app --port 8000      (compose service `admin`, published on 127.0.0.1 only)

Every request needs `Authorization: Bearer <ADMIN_TOKEN>`; without ADMIN_TOKEN in .env everything answers
503. The console sends `X-Admin-Actor: <device name>`; every change lands in admin_log with it.

What it manages: schools, campuses and classes (with Untis search), users (look up, edit, turn off, sign
out, delete), background jobs, a read-only view of every table, mail test, and an overview with counts
and health."""
import datetime as dt
import logging
import re
import zoneinfo
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import accounts, config, crypto, db, debug, i18n, jobs, sync, tokens, untis
from .errors import ApiError

log = logging.getLogger("roosters.admin")

app = FastAPI(title="Roosters+ admin API", version="1.0", docs_url="/admin/docs" if config.DEV else None,
              redoc_url=None, openapi_url="/admin/openapi.json")
router = APIRouter(prefix="/admin/v1")

# Never shown in the table browser: hashes and encrypted links are useless there and only leak
SECRET_COLUMNS = {"secret_enc", "refresh_hash", "prev_refresh_hash", "code_hash", "email_hash", "body"}
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,59}$")


# ---- Access ----------------------------------------------------------------------

def admin(request: Request) -> str:
    """Checks the admin token; -> the actor name for admin_log."""
    if len(config.ADMIN_TOKEN) < 32:
        raise ApiError(503, "admin_off")
    header = request.headers.get("authorization") or ""
    if not header.lower().startswith("bearer ") or not crypto.same(header[7:].strip(), config.ADMIN_TOKEN):
        raise ApiError(401, "auth_required")
    return (request.headers.get("x-admin-actor") or "console").strip()[:80] or "console"


def record(actor: str, action: str, target: str | None = None, detail=None, c=None):
    db.run("INSERT INTO admin_log (actor, action, target, detail) VALUES (%s,%s,%s,%s)",
           (actor, action, target, db.js(detail) if detail is not None else None), c)


@app.exception_handler(ApiError)
async def api_error(request: Request, exc: ApiError):
    message = ADMIN_ERRORS.get(exc.code) or i18n.error(exc.code, "en")
    return JSONResponse({"code": exc.code, "message": message, **exc.extra}, status_code=exc.status)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    fields = [".".join(str(x) for x in e.get("loc", ())[1:]) for e in exc.errors()]
    return JSONResponse({"code": "invalid", "message": "Invalid input: " + ", ".join(fields), "fields": fields},
                        status_code=422)


ADMIN_ERRORS = {
    "admin_off": "The admin API is off: set ADMIN_TOKEN (32+ characters) in app/.env and restart the admin service.",
    "slug_taken": "Another school already uses that slug.",
    "slug_invalid": "Slug: lowercase letters, digits and dashes (e.g. 'ap').",
    "school_in_use": "Users still have this school. Turn it off instead, or move them first.",
    "untis": "Untis didn't answer.",
    "table_unknown": "No such table.",
    "column_unknown": "No such column.",
    "not_found": "Not found.",
}


def _ts(v):
    return v.isoformat() + "Z" if isinstance(v, dt.datetime) else v.isoformat() if isinstance(v, dt.date) else v


def _out(row: dict | None) -> dict | None:
    return None if row is None else {k: _ts(v) for k, v in row.items()}


# ---- Overview --------------------------------------------------------------------

@router.get("/overview")
def overview(_: str = Depends(admin)):
    """Counts, health of the worker and mail, migrations: the first card in the console."""
    one = lambda sql: db.one(sql)["n"]  # noqa: E731
    counts = {
        "users": one("SELECT COUNT(*) AS n FROM users WHERE is_guest=0"),
        "guests": one("SELECT COUNT(*) AS n FROM users WHERE is_guest=1"),
        "disabled": one("SELECT COUNT(*) AS n FROM users WHERE disabled_at IS NOT NULL"),
        "onboarded": one("SELECT COUNT(*) AS n FROM users WHERE onboarded_at IS NOT NULL"),
        "active_24h": one("SELECT COUNT(DISTINCT user_id) AS n FROM sessions "
                          "WHERE last_used_at > UTC_TIMESTAMP() - INTERVAL 1 DAY"),
        "active_7d": one("SELECT COUNT(DISTINCT user_id) AS n FROM sessions "
                         "WHERE last_used_at > UTC_TIMESTAMP() - INTERVAL 7 DAY"),
        "new_7d": one("SELECT COUNT(*) AS n FROM users WHERE created_at > UTC_TIMESTAMP() - INTERVAL 7 DAY"),
        "schools": one("SELECT COUNT(*) AS n FROM schools WHERE active=1"),
        "classes": one("SELECT COUNT(*) AS n FROM school_classes WHERE active=1"),
        "followed_classes": one("SELECT COUNT(DISTINCT school_class_id) AS n FROM sources "
                                "WHERE kind='untis' AND deleted_at IS NULL"),
        "calendar_links": one("SELECT COUNT(*) AS n FROM sources WHERE kind='ics' AND deleted_at IS NULL"),
        "friendships": one("SELECT COUNT(*) AS n FROM friendships") // 2,
        "jobs_queued": one("SELECT COUNT(*) AS n FROM jobs WHERE status='queued'"),
        "jobs_failed": one("SELECT COUNT(*) AS n FROM jobs WHERE status='failed'"),
        "sync_errors": one("SELECT COUNT(*) AS n FROM school_classes WHERE last_error IS NOT NULL AND active=1"),
    }
    diag = debug.diagnose()
    return {
        "env": config.ENV, "public_url": config.PUBLIC_URL, "counts": counts,
        "worker": diag["worker"], "mail": diag["mail"], "hints": diag["hints"],
        "migrations": [_out(r) for r in db.rows("SELECT version, applied_at FROM schema_migrations ORDER BY version")],
        "now": _ts(db.utcnow()),
    }


# ---- Schools ---------------------------------------------------------------------

class SchoolIn(BaseModel):
    slug: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=1, max_length=160)
    short_name: str | None = Field(None, max_length=40)
    country: str = Field("BE", min_length=2, max_length=2)
    tz: str = Field("Europe/Brussels", max_length=40)
    untis_server: str | None = Field(None, max_length=120)
    untis_login: str | None = Field(None, max_length=120)
    campuses: list[str] = Field(default_factory=list, max_length=50)
    # Semesters as 'MM-DD' (see terms.py): S1 from year_start, S2 from s2_start until year_end
    year_start: str = Field("09-01", pattern=r"^\d\d-\d\d$")
    s2_start: str = Field("02-01", pattern=r"^\d\d-\d\d$")
    year_end: str = Field("07-15", pattern=r"^\d\d-\d\d$")


class SchoolPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=160)
    short_name: str | None = Field(None, max_length=40)
    country: str | None = Field(None, min_length=2, max_length=2)
    tz: str | None = Field(None, max_length=40)
    untis_server: str | None = Field(None, max_length=120)
    untis_login: str | None = Field(None, max_length=120)
    year_start: str | None = Field(None, pattern=r"^\d\d-\d\d$")
    s2_start: str | None = Field(None, pattern=r"^\d\d-\d\d$")
    year_end: str | None = Field(None, pattern=r"^\d\d-\d\d$")
    active: bool | None = None


def _check_school_fields(f: dict):
    if f.get("tz"):
        try:
            zoneinfo.ZoneInfo(f["tz"])
        except (zoneinfo.ZoneInfoNotFoundError, ValueError):
            raise ApiError(400, "invalid", field="tz")
    if f.get("untis_server"):
        try:
            f["untis_server"] = untis.check_server(f["untis_server"])
        except untis.UntisError:
            raise ApiError(400, "invalid", field="untis_server")
    for k in ("year_start", "s2_start", "year_end"):
        if f.get(k):
            try:
                dt.date(2024, *(int(x) for x in f[k].split("-")))
            except ValueError:
                raise ApiError(400, "invalid", field=k)
    if "country" in f and f["country"]:
        f["country"] = f["country"].upper()


def _school_out(s: dict) -> dict:
    out = _out(s)
    out["active"] = bool(s["active"])
    return out


SCHOOL_SQL = ("SELECT s.*, (SELECT COUNT(*) FROM school_classes c WHERE c.school_id=s.id AND c.active=1) AS classes, "
              "(SELECT COUNT(*) FROM school_classes c WHERE c.school_id=s.id AND c.active=1 AND c.last_error IS NOT NULL) "
              "AS class_errors, (SELECT COUNT(*) FROM users u WHERE u.school_id=s.id) AS users FROM schools s")


@router.get("/schools")
def schools(_: str = Depends(admin)):
    rows = db.rows(SCHOOL_SQL + " ORDER BY s.active DESC, s.name")
    camp = db.rows("SELECT c.id, c.school_id, c.name, (SELECT COUNT(*) FROM users u WHERE u.campus_id=c.id) AS users "
                   "FROM campuses c ORDER BY c.name")
    out = []
    for s in rows:
        o = _school_out(s)
        o["campuses"] = [{"id": c["id"], "name": c["name"], "users": c["users"]} for c in camp if c["school_id"] == s["id"]]
        out.append(o)
    return {"schools": out}


@router.post("/schools", status_code=201)
def add_school(body: SchoolIn, actor: str = Depends(admin)):
    """Adds (or brings back) a school; with an Untis server the worker fetches its class list right away."""
    f = body.model_dump()
    f["slug"] = f["slug"].strip().lower()
    if not SLUG_RE.match(f["slug"]):
        raise ApiError(400, "slug_invalid")
    _check_school_fields(f)
    with db.tx() as c:
        if db.one("SELECT id FROM schools WHERE slug=%s", (f["slug"],), c):
            raise ApiError(409, "slug_taken")
        sid = db.run("INSERT INTO schools (slug, name, short_name, country, tz, year_start, s2_start, year_end, "
                     "untis_server, untis_login) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                     (f["slug"], f["name"].strip(), (f["short_name"] or "").strip() or None, f["country"], f["tz"],
                      f["year_start"], f["s2_start"], f["year_end"],
                      f["untis_server"] or None, (f["untis_login"] or "").strip() or None), c)
        for name in {n.strip()[:120] for n in f["campuses"] if n.strip()}:
            db.run("INSERT IGNORE INTO campuses (school_id, name) VALUES (%s,%s)", (sid, name), c)
        if f["untis_server"]:
            jobs.enqueue("refresh_classes", {"school_id": sid}, dedupe=f"refresh_classes:{sid}", priority=1, c=c)
        record(actor, "school_add", f["slug"], {k: v for k, v in f.items() if k != "campuses"}, c)
    return {"school": _school_out(db.one(SCHOOL_SQL + " WHERE s.id=%s", (sid,)))}


@router.patch("/schools/{school_id}")
def edit_school(school_id: int, body: SchoolPatch, actor: str = Depends(admin)):
    f = body.model_dump(exclude_unset=True)
    _check_school_fields(f)
    if not db.one("SELECT id FROM schools WHERE id=%s", (school_id,)):
        raise ApiError(404, "not_found")
    if f:
        cols = ", ".join(f"{k}=%s" for k in f)
        db.run(f"UPDATE schools SET {cols} WHERE id=%s", (*[int(v) if isinstance(v, bool) else v for v in f.values()],
                                                          school_id))
        record(actor, "school_edit", str(school_id), f)
    return {"school": _school_out(db.one(SCHOOL_SQL + " WHERE s.id=%s", (school_id,)))}


@router.delete("/schools/{school_id}", status_code=204)
def delete_school(school_id: int, actor: str = Depends(admin)):
    """Only a school nobody uses: its campuses, classes and their timetables go with it."""
    with db.tx() as c:
        s = db.one("SELECT * FROM schools WHERE id=%s FOR UPDATE", (school_id,), c)
        if s is None:
            raise ApiError(404, "not_found")
        if db.one("SELECT 1 AS x FROM users WHERE school_id=%s LIMIT 1", (school_id,), c):
            raise ApiError(409, "school_in_use")
        db.run("DELETE FROM class_lessons WHERE school_class_id IN (SELECT id FROM school_classes WHERE school_id=%s)",
               (school_id,), c)
        db.run("UPDATE sources SET deleted_at=UTC_TIMESTAMP() WHERE school_class_id IN "
               "(SELECT id FROM school_classes WHERE school_id=%s) AND deleted_at IS NULL", (school_id,), c)
        db.run("DELETE FROM school_classes WHERE school_id=%s", (school_id,), c)
        db.run("DELETE FROM campuses WHERE school_id=%s", (school_id,), c)
        db.run("DELETE FROM schools WHERE id=%s", (school_id,), c)
        record(actor, "school_delete", s["slug"], None, c)
    return Response(status_code=204)


@router.post("/schools/{school_id}/refresh-classes", status_code=202)
def refresh_school_classes(school_id: int, actor: str = Depends(admin)):
    """Fetch the list of classes from Untis again (the worker does it, within seconds)."""
    s = db.one("SELECT * FROM schools WHERE id=%s", (school_id,))
    if s is None:
        raise ApiError(404, "not_found")
    if not s["untis_server"]:
        raise ApiError(400, "invalid", field="untis_server")
    job = jobs.enqueue("refresh_classes", {"school_id": school_id}, dedupe=f"refresh_classes:{school_id}", priority=1)
    record(actor, "school_refresh_classes", s["slug"])
    return {"job": job}


@router.get("/untis/search")
def untis_search(q: str, _: str = Depends(admin)):
    """Find a school in Untis: fills in server and login name for 'Add school'."""
    try:
        return {"schools": untis.search_schools(q)}
    except untis.UntisError as e:
        raise ApiError(502, "untis", detail=str(e))


# ---- Campuses --------------------------------------------------------------------

class CampusIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


@router.post("/schools/{school_id}/campuses", status_code=201)
def add_campus(school_id: int, body: CampusIn, actor: str = Depends(admin)):
    if not db.one("SELECT id FROM schools WHERE id=%s", (school_id,)):
        raise ApiError(404, "not_found")
    db.run("INSERT IGNORE INTO campuses (school_id, name) VALUES (%s,%s)", (school_id, body.name.strip()))
    record(actor, "campus_add", str(school_id), body.name.strip())
    return {"campus": db.one("SELECT id, school_id, name FROM campuses WHERE school_id=%s AND name=%s",
                             (school_id, body.name.strip()))}


@router.patch("/campuses/{campus_id}")
def rename_campus(campus_id: int, body: CampusIn, actor: str = Depends(admin)):
    if not db.run("UPDATE campuses SET name=%s WHERE id=%s", (body.name.strip(), campus_id)) and \
            not db.one("SELECT id FROM campuses WHERE id=%s", (campus_id,)):
        raise ApiError(404, "not_found")
    record(actor, "campus_rename", str(campus_id), body.name.strip())
    return {"campus": db.one("SELECT id, school_id, name FROM campuses WHERE id=%s", (campus_id,))}


@router.delete("/campuses/{campus_id}", status_code=204)
def delete_campus(campus_id: int, actor: str = Depends(admin)):
    """Users on this campus keep their school, their campus becomes 'not set'."""
    with db.tx() as c:
        if not db.one("SELECT id FROM campuses WHERE id=%s", (campus_id,), c):
            raise ApiError(404, "not_found")
        db.run("UPDATE users SET campus_id=NULL WHERE campus_id=%s", (campus_id,), c)
        db.run("DELETE FROM campuses WHERE id=%s", (campus_id,), c)
        record(actor, "campus_delete", str(campus_id), None, c)
    return Response(status_code=204)


# ---- Classes ---------------------------------------------------------------------

@router.get("/schools/{school_id}/classes")
def classes(school_id: int, q: str = "", errors: bool = False, _: str = Depends(admin)):
    sql = ("SELECT c.*, (SELECT COUNT(DISTINCT s.user_id) FROM sources s WHERE s.school_class_id=c.id "
           "AND s.deleted_at IS NULL) AS followers FROM school_classes c WHERE c.school_id=%s")
    args: list = [school_id]
    if q.strip():
        sql += " AND (c.name LIKE %s OR c.long_name LIKE %s)"
        like = "%" + q.strip().replace("%", "").replace("_", "") + "%"
        args += [like, like]
    if errors:
        sql += " AND c.last_error IS NOT NULL"
    rows = db.rows(sql + " ORDER BY followers DESC, c.name LIMIT 500", args)
    return {"classes": [dict(_out(r), active=bool(r["active"])) for r in rows]}


class ClassPatch(BaseModel):
    active: bool


@router.patch("/classes/{class_id}")
def edit_class(class_id: int, body: ClassPatch, actor: str = Depends(admin)):
    if not db.one("SELECT id FROM school_classes WHERE id=%s", (class_id,)):
        raise ApiError(404, "not_found")
    db.run("UPDATE school_classes SET active=%s WHERE id=%s", (int(body.active), class_id))
    record(actor, "class_edit", str(class_id), {"active": body.active})
    return {"class": _out(db.one("SELECT * FROM school_classes WHERE id=%s", (class_id,)))}


@router.post("/classes/{class_id}/sync", status_code=202)
def sync_class_now(class_id: int, actor: str = Depends(admin)):
    if not db.one("SELECT id FROM school_classes WHERE id=%s", (class_id,)):
        raise ApiError(404, "not_found")
    sync.queue_class(class_id, soon=True)
    record(actor, "class_sync", str(class_id))
    return {"queued": True}


# ---- Users -----------------------------------------------------------------------

USER_COLS = ("u.id, u.display_name, u.email, u.is_guest, u.locale, u.school_id, u.campus_id, u.onboarded_at, "
             "u.disabled_at, u.created_at, sch.short_name AS school, "
             "(SELECT MAX(s.last_used_at) FROM sessions s WHERE s.user_id=u.id) AS last_seen, "
             "(SELECT COUNT(*) FROM friendships f WHERE f.user_id=u.id) AS friends, "
             "(SELECT COUNT(*) FROM sources so WHERE so.user_id=u.id AND so.deleted_at IS NULL) AS sources")


def _user_out(r: dict) -> dict:
    out = _out(r)
    out["is_guest"] = bool(r["is_guest"])
    return out


@router.get("/users")
def users(q: str = "", kind: Literal["all", "guests", "verified", "disabled"] = "all", school_id: int | None = None,
          limit: int = 50, offset: int = 0, _: str = Depends(admin)):
    """Search by name, e-mail or id."""
    where, args = ["1=1"], []
    if q.strip():
        needle = q.strip()
        if needle.isdigit():
            where.append("u.id=%s")
            args.append(int(needle))
        else:
            like = "%" + needle.replace("%", "").replace("_", "") + "%"
            where.append("(u.display_name LIKE %s OR u.email LIKE %s)")
            args += [like, like]
    where.append({"all": "1=1", "guests": "u.is_guest=1", "verified": "u.is_guest=0",
                  "disabled": "u.disabled_at IS NOT NULL"}[kind])
    if school_id is not None:
        where.append("u.school_id=%s")
        args.append(school_id)
    limit = max(1, min(limit, 200))
    sql_where = " AND ".join(where)
    total = db.one(f"SELECT COUNT(*) AS n FROM users u WHERE {sql_where}", args)["n"]
    rows = db.rows(f"SELECT {USER_COLS} FROM users u LEFT JOIN schools sch ON sch.id=u.school_id WHERE {sql_where} "
                   "ORDER BY u.id DESC LIMIT %s OFFSET %s", (*args, limit, max(0, offset)))
    return {"total": total, "users": [_user_out(r) for r in rows]}


@router.get("/users/{user_id}")
def user(user_id: int, _: str = Depends(admin)):
    u = db.one(f"SELECT {USER_COLS} FROM users u LEFT JOIN schools sch ON sch.id=u.school_id WHERE u.id=%s", (user_id,))
    if u is None:
        raise ApiError(404, "not_found")
    return {
        "user": _user_out(u),
        "sign_in": [_out(r) for r in db.rows("SELECT provider, email, created_at, last_used_at FROM auth_identities "
                                             "WHERE user_id=%s", (user_id,))],
        "sessions": [_out(r) for r in db.rows(
            "SELECT id, device_name, platform, created_at, last_used_at, expires_at, revoked_at FROM sessions "
            "WHERE user_id=%s ORDER BY last_used_at DESC LIMIT 20", (user_id,))],
        "sources": [_out(r) for r in db.rows(
            "SELECT s.id, s.kind, s.label, s.school_class_id, s.last_ok, s.last_error, s.created_at, s.deleted_at "
            "FROM sources s WHERE s.user_id=%s ORDER BY s.id", (user_id,))],
        "friends": [_out(r) for r in db.rows(
            "SELECT u.id, u.display_name, f.visibility, f.created_at FROM friendships f JOIN users u ON u.id=f.friend_id "
            "WHERE f.user_id=%s ORDER BY u.display_name LIMIT 300", (user_id,))],
    }


class UserPatch(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=60)
    school_id: int | None = None
    campus_id: int | None = None
    disabled: bool | None = None


@router.patch("/users/{user_id}")
def edit_user(user_id: int, body: UserPatch, actor: str = Depends(admin)):
    f = body.model_dump(exclude_unset=True)
    with db.tx() as c:
        u = db.one("SELECT * FROM users WHERE id=%s FOR UPDATE", (user_id,), c)
        if u is None:
            raise ApiError(404, "not_found")
        if f.get("display_name"):
            db.run("UPDATE users SET display_name=%s WHERE id=%s", (f["display_name"].strip(), user_id), c)
        if "school_id" in f:
            if f["school_id"] is not None and not db.one("SELECT id FROM schools WHERE id=%s", (f["school_id"],), c):
                raise ApiError(400, "school_unknown")
            db.run("UPDATE users SET school_id=%s, campus_id=NULL WHERE id=%s", (f["school_id"], user_id), c)
        if "campus_id" in f:
            school = f.get("school_id", u["school_id"])
            if f["campus_id"] is not None and not db.one("SELECT id FROM campuses WHERE id=%s AND school_id=%s",
                                                         (f["campus_id"], school), c):
                raise ApiError(400, "campus_unknown")
            db.run("UPDATE users SET campus_id=%s WHERE id=%s", (f["campus_id"], user_id), c)
        if f.get("disabled") is True:
            db.run("UPDATE users SET disabled_at=UTC_TIMESTAMP() WHERE id=%s AND disabled_at IS NULL", (user_id,), c)
            tokens.revoke_all(user_id, "disabled", c)
        elif f.get("disabled") is False:
            db.run("UPDATE users SET disabled_at=NULL WHERE id=%s", (user_id,), c)
        record(actor, "user_edit", str(user_id), f, c)
    return user(user_id, actor)


@router.post("/users/{user_id}/logout-all", status_code=204)
def logout_user(user_id: int, actor: str = Depends(admin)):
    tokens.revoke_all(user_id, "admin")
    record(actor, "user_logout_all", str(user_id))
    return Response(status_code=204)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, actor: str = Depends(admin)):
    """The account and everything linked to it, like 'Delete account' in the app."""
    with db.tx() as c:
        u = db.one("SELECT id, email, display_name FROM users WHERE id=%s FOR UPDATE", (user_id,), c)
        if u is None:
            raise ApiError(404, "not_found")
        accounts.delete_user(c, user_id)
        record(actor, "user_delete", str(user_id), {"display_name": u["display_name"]}, c)
    return Response(status_code=204)


# ---- Jobs ------------------------------------------------------------------------

@router.get("/jobs")
def job_list(status: Literal["all", "queued", "running", "done", "failed"] = "all", kind: str = "", limit: int = 100,
             _: str = Depends(admin)):
    where, args = ["1=1"], []
    if status != "all":
        where.append("status=%s")
        args.append(status)
    if kind.strip():
        where.append("kind=%s")
        args.append(kind.strip())
    rows = db.rows(f"SELECT id, kind, dedupe, payload, status, priority, run_at, attempts, max_attempts, locked_by, "
                   f"last_error, created_at, finished_at FROM jobs WHERE {' AND '.join(where)} ORDER BY id DESC LIMIT %s",
                   (*args, max(1, min(limit, 500))))
    out = []
    for r in rows:
        o = _out(r)
        payload = db.unjs(r["payload"], {}) or {}
        # Login codes are in the payload: never show them
        o["payload"] = {k: ("•••" if k in ("code", "email") else v) for k, v in payload.items()}
        out.append(o)
    stats = db.rows("SELECT kind, status, COUNT(*) AS n FROM jobs GROUP BY kind, status ORDER BY kind, status")
    return {"jobs": out, "stats": stats}


@router.post("/jobs/{job_id}/run-now", status_code=202)
def run_job_now(job_id: int, actor: str = Depends(admin)):
    """A queued job waiting out its backoff (e.g. Untis was down): run it at the next worker round.
    Finished and failed jobs can't be re-run: their payload is cleared (jobs._finish); queue the work
    again instead (a class: POST /classes/{id}/sync, a school's class list: refresh-classes)."""
    n = db.run("UPDATE jobs SET run_at=UTC_TIMESTAMP() WHERE id=%s AND status='queued'", (job_id,))
    if not n:
        raise ApiError(404, "not_found")
    record(actor, "job_run_now", str(job_id))
    return {"queued": True}


@router.delete("/jobs/{job_id}", status_code=204)
def delete_job(job_id: int, actor: str = Depends(admin)):
    if not db.run("DELETE FROM jobs WHERE id=%s AND status<>'running'", (job_id,)):
        raise ApiError(404, "not_found")
    record(actor, "job_delete", str(job_id))
    return Response(status_code=204)


# ---- Tables (read-only) ----------------------------------------------------------

def _tables() -> list[str]:
    return sorted(list(r.values())[0] for r in db.rows("SHOW TABLES"))


@router.get("/tables")
def tables(_: str = Depends(admin)):
    """Every table with its row count and columns: the console's database browser."""
    out = []
    for t in _tables():
        cols = db.rows(f"SHOW COLUMNS FROM `{t}`")
        out.append({"name": t, "rows": db.one(f"SELECT COUNT(*) AS n FROM `{t}`")["n"],
                    "columns": [{"name": c["Field"], "type": c["Type"], "key": c["Key"], "null": c["Null"] == "YES"}
                                for c in cols]})
    return {"tables": out}


@router.get("/tables/{table}")
def table_rows(table: str, column: str = "", value: str = "", limit: int = 50, offset: int = 0,
               _: str = Depends(admin)):
    """Rows of one table, newest first, optionally where `column` = `value`. Secrets are masked."""
    if table not in _tables():
        raise ApiError(404, "table_unknown")
    cols = [c["Field"] for c in db.rows(f"SHOW COLUMNS FROM `{table}`")]
    pk = [c["Column_name"] for c in db.rows(f"SHOW KEYS FROM `{table}` WHERE Key_name='PRIMARY'")]
    where, args = "", []
    if column:
        if column not in cols:
            raise ApiError(400, "column_unknown")
        where, args = f" WHERE `{column}`=%s", [value]
    order = " ORDER BY " + ", ".join(f"`{k}` DESC" for k in pk) if pk else ""
    limit = max(1, min(limit, 500))
    total = db.one(f"SELECT COUNT(*) AS n FROM `{table}`{where}", args)["n"]
    rows = db.rows(f"SELECT * FROM `{table}`{where}{order} LIMIT %s OFFSET %s", (*args, limit, max(0, offset)))
    clean = []
    for r in rows:
        o = {}
        for k, v in r.items():
            if k in SECRET_COLUMNS and v is not None:
                o[k] = "•••"
            elif isinstance(v, bytes):
                o[k] = f"<{len(v)} bytes>"
            else:
                o[k] = _ts(v)
        clean.append(o)
    return {"table": table, "columns": cols, "primary_key": pk, "total": total, "rows": clean}


# ---- Mail, log -------------------------------------------------------------------

class TestMailIn(BaseModel):
    to: str = Field(min_length=3, max_length=254)


@router.post("/mail/test")
def test_mail(body: TestMailIn, actor: str = Depends(admin)):
    """Sends right away (not via the worker), so an SMTP error shows up here."""
    record(actor, "mail_test", body.to.strip())
    return debug.send_test_mail(body.to.strip())


@router.get("/log")
def admin_log(limit: int = 100, _: str = Depends(admin)):
    return {"log": [_out(r) for r in db.rows("SELECT * FROM admin_log ORDER BY id DESC LIMIT %s",
                                             (max(1, min(limit, 500)),))]}


@app.get("/admin/health")
def health():
    """No token needed: is the admin service up, and is it configured?"""
    return {"ok": True, "configured": len(config.ADMIN_TOKEN) >= 32}


app.include_router(router)
