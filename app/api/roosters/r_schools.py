"""Schools, campuses and classes (for onboarding, per semester), and the courses in a class this school year
(to pick yours)."""
import datetime as dt

from fastapi import APIRouter, Depends, Query, Request

from . import config, db, schedule, sync, terms
from .deps import Ctx, auth, etag_json, parse_day
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
    """All classes of the school (a few hundred: the app filters while typing, offline too), with the
    semesters each one exists in, and the dates of both semesters of this school year."""
    school = _school(school_id)
    sql = "SELECT id, name, long_name, in_s1, in_s2 FROM school_classes WHERE school_id=%s AND active=1"
    args = [school_id]
    if q.strip():
        sql += " AND (name LIKE %s OR long_name LIKE %s)"
        like = "%" + q.strip().replace("\\", "").replace("%", "").replace("_", "") + "%"
        args += [like, like]
    rows = [{"id": r["id"], "name": r["name"], "long_name": r["long_name"],
             "semesters": [n for n, on in ((1, r["in_s1"]), (2, r["in_s2"])) if on] or [1, 2]}
            for r in db.rows(sql + " ORDER BY name LIMIT 2000", args)]
    today = schedule.local_now(ctx.user).date()
    return etag_json(request, {"classes": rows, "terms": terms.school_year(school, today).out(today)})


@router.get("/{school_id}/classes/{class_id}/courses")
def courses(school_id: int, class_id: int, request: Request, semester: int | None = Query(None, ge=1, le=2),
            ctx: Ctx = Depends(auth)):
    """The courses that class has this school year (or in one semester), to switch off the ones you don't
    take. Not just the coming weeks: a course that starts in a month must be pickable today.
    The whole year comes from the course scan (sync.scan_courses); until that is done (scanning=true) you
    get what the near weeks have, and the app asks again in a moment. Never fetched at all: syncing=true."""
    cls = db.one("SELECT sc.*, s.year_start, s.s2_start, s.year_end FROM school_classes sc "
                 "JOIN schools s ON s.id=sc.school_id WHERE sc.id=%s AND sc.school_id=%s AND sc.active=1",
                 (class_id, school_id))
    if cls is None:
        raise ApiError(404, "class_unknown")
    scanned = cls["courses_scanned_at"]
    if scanned is None or db.utcnow() - scanned > dt.timedelta(days=config.COURSES_RESCAN_DAYS):
        sync.queue_scan(class_id)
    if cls["last_ok"] is None:
        sync.queue_class(class_id, soon=True)
        if scanned is None:
            return {"syncing": True, "scanning": True, "error": cls["last_error"], "courses": []}
    today = schedule.local_now(ctx.user).date()
    year = terms.school_year(cls, today)
    found: dict[str, dict] = {}

    def add(course: str, sem: int | None, n: int):
        if sem is None or (semester and sem != semester):
            return
        f = found.setdefault(course, {"name": course, "lessons": 0, "semesters": []})
        f["lessons"] += n
        if sem not in f["semesters"]:
            f["semesters"].append(sem)

    for r in db.rows("SELECT semester, course, lessons FROM class_courses WHERE school_class_id=%s", (class_id,)):
        add(r["course"], r["semester"], r["lessons"])
    if scanned is None:
        # Until the scan is done: the weeks we already have (counted per semester they fall in)
        for r in db.rows("SELECT course, day FROM class_lessons WHERE school_class_id=%s AND day>=%s "
                         "AND state NOT IN ('removed','cancelled')", (class_id, today - dt.timedelta(days=7))):
            add(r["course"], year.semester(r["day"]), 1)
    else:
        # Added in Untis since the scan: still shows up
        for r in db.rows("SELECT DISTINCT course, day FROM class_lessons WHERE school_class_id=%s AND day>=%s "
                         "AND state NOT IN ('removed','cancelled')", (class_id, today)):
            if r["course"] not in found:
                add(r["course"], year.semester(r["day"]), 1)
    out = sorted(found.values(), key=lambda f: f["name"].lower())
    for f in out:
        f["semesters"].sort()
    # A scan that failed stops the app's polling; the job retries on its own and the next visit has it
    return etag_json(request, {"syncing": False, "scanning": scanned is None and not cls["courses_error"], "error": cls["courses_error"],
                               "courses": out})


@router.get("/{school_id}/classes/{class_id}/lessons")
def class_lessons(school_id: int, class_id: int, request: Request, start: str | None = None, days: int = 7,
                  ctx: Ctx = Depends(auth)):
    """A class's whole timetable (every course, not just yours) for up to 14 days: onboarding shows it
    ('see this class's timetable'), previews the timetable your picks would give, and finds what you're
    missing ('Ik mis een les'). Public school data, like the class list. Far weeks: `loading`, as for
    your own schedule (`schedule.ensure_weeks`)."""
    cls = db.one("SELECT * FROM school_classes WHERE id=%s AND school_id=%s AND active=1", (class_id, school_id))
    if cls is None:
        raise ApiError(404, "class_unknown")
    today = schedule.local_now(ctx.user).date()
    first = parse_day(start, today - dt.timedelta(days=today.weekday()))
    days = max(1, min(days, 14))
    last = first + dt.timedelta(days=days - 1)
    loading = False
    if cls["last_ok"] is None:
        sync.queue_class(class_id, soon=True)
        loading = True
    loading = schedule.ensure_class_weeks([class_id], schedule.outside_mondays(first, last, today), today) or loading
    rows = db.rows("SELECT day, start_min, end_min, course, location, student_group, state FROM class_lessons "
                   "WHERE school_class_id=%s AND day BETWEEN %s AND %s AND state <> 'removed' "
                   "ORDER BY day, start_min, course", (class_id, first, last))
    return etag_json(request, {"start": first.isoformat(), "days": days, "loading": loading, "lessons": [
        {"day": r["day"].isoformat(), "start": r["start_min"], "end": r["end_min"], "course": r["course"],
         "location": r["location"], "group": r["student_group"], "state": r["state"]} for r in rows]})
