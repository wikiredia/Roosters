"""Schools, campuses and classes (for onboarding), and the courses in a class (to pick yours)."""
import datetime as dt

from fastapi import APIRouter, Depends, Request

from . import db, schedule, sync
from .deps import Ctx, auth, etag_json
from .errors import ApiError

router = APIRouter(prefix="/api/v1/schools", tags=["schools"])


def _school(school_id: int) -> dict:
    s = db.one("SELECT * FROM schools WHERE id=%s AND active=1", (school_id,))
    if s is None:
        raise ApiError(404, "school_unknown")
    return s


@router.get("")
def schools(request: Request, ctx: Ctx = Depends(auth)):
    rows = db.rows("SELECT id, slug, name, short_name, country FROM schools WHERE active=1 ORDER BY name")
    return etag_json(request, {"schools": rows})


@router.get("/{school_id}/campuses")
def campuses(school_id: int, request: Request, ctx: Ctx = Depends(auth)):
    _school(school_id)
    return etag_json(request, {"campuses": db.rows("SELECT id, name FROM campuses WHERE school_id=%s ORDER BY name",
                                                   (school_id,))})


@router.get("/{school_id}/classes")
def classes(school_id: int, request: Request, q: str = "", ctx: Ctx = Depends(auth)):
    """All classes of the school (a few hundred: the app filters while typing, offline too)."""
    _school(school_id)
    sql = "SELECT id, name, long_name FROM school_classes WHERE school_id=%s AND active=1"
    args = [school_id]
    if q.strip():
        sql += " AND (name LIKE %s OR long_name LIKE %s)"
        like = "%" + q.strip().replace("\\", "").replace("%", "").replace("_", "") + "%"
        args += [like, like]
    return etag_json(request, {"classes": db.rows(sql + " ORDER BY name LIMIT 2000", args)})


@router.get("/{school_id}/classes/{class_id}/courses")
def courses(school_id: int, class_id: int, request: Request, ctx: Ctx = Depends(auth)):
    """The courses that class has in the coming weeks, to switch off the ones you don't take.
    Never fetched yet: we fetch it now and the app asks again in a moment (syncing=true)."""
    cls = db.one("SELECT * FROM school_classes WHERE id=%s AND school_id=%s AND active=1", (class_id, school_id))
    if cls is None:
        raise ApiError(404, "class_unknown")
    if cls["last_ok"] is None:
        sync.queue_class(class_id, soon=True)
        return {"syncing": True, "error": cls["last_error"], "courses": []}
    today = schedule.local_now(ctx.user).date()
    rows = db.rows(
        "SELECT course, COUNT(*) AS n FROM class_lessons WHERE school_class_id=%s AND day BETWEEN %s AND %s "
        "AND state <> 'removed' GROUP BY course ORDER BY course",
        (class_id, today - dt.timedelta(days=today.weekday()), today + dt.timedelta(days=28)))
    return etag_json(request, {"syncing": False, "courses": [{"name": r["course"], "lessons": r["n"]} for r in rows]})
