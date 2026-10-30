"""Your lesson details: per origin (your school's Untis classes, each calendar link) the fields its data breaks
into, what we suggest, what you saved, and a layout schoolmates use. The logic is in details.py; the app's
screen is mobile/src/app/onboarding/details.tsx (onboarding step 6, and Settings → Timetable sources)."""
from collections import Counter

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from . import db, details
from .deps import Ctx, auth, etag_json
from .errors import ApiError

router = APIRouter(prefix="/api/v1/me/details", tags=["me"])

# Enough rows to see how a source writes its rooms, few enough to stay quick
SAMPLE = 1500
# Schoolmates' layouts looked at for a suggestion
SHARED_SAMPLE = 500


class LayoutIn(BaseModel):
    layout: dict


def origins(uid: int) -> list[dict]:
    """Where your lessons come from, one entry per way of writing them: your school (all your Untis classes
    together) and each calendar link."""
    out, schools = [], {}
    for s in db.rows("SELECT s.id, s.kind, s.label, s.school_class_id, s.last_ok, s.last_error, sc.school_id, "
                     "sc.last_ok AS class_last_ok, sch.name AS school_name FROM sources s "
                     "LEFT JOIN school_classes sc ON sc.id=s.school_class_id LEFT JOIN schools sch ON sch.id=sc.school_id "
                     "WHERE s.user_id=%s AND s.deleted_at IS NULL ORDER BY s.id", (uid,)):
        if s["kind"] == "untis" and s["school_id"]:
            o = schools.get(s["school_id"])
            if o is None:
                o = schools[s["school_id"]] = {"origin": f"untis:{s['school_id']}", "kind": "untis",
                                               "name": s["school_name"], "school_id": s["school_id"], "classes": []}
                out.append(o)
            o["classes"].append(s["school_class_id"])
        elif s["kind"] == "ics":
            out.append({"origin": f"ics:{s['id']}", "kind": "ics", "name": s["label"], "source_id": s["id"]})
    return out


def _sample(o: dict) -> list[dict]:
    """Lessons of this origin to learn from: your own classes (the whole school's while they're not fetched yet)."""
    if o["kind"] == "ics":
        return db.rows("SELECT course, location, kind, NULL AS `group` FROM source_lessons WHERE source_id=%s "
                       "ORDER BY day, start_min LIMIT %s", (o["source_id"], SAMPLE))
    ph, args = db.in_list(o["classes"])
    cols = "SELECT cl.course, cl.location, cl.kind, cl.student_group AS `group` FROM class_lessons cl "
    rows = db.rows(f"{cols}WHERE cl.school_class_id IN ({ph}) AND cl.state<>'removed' ORDER BY cl.day, cl.start_min "
                   f"LIMIT %s", (*args, SAMPLE))
    if not rows:
        rows = db.rows(f"{cols}JOIN school_classes sc ON sc.id=cl.school_class_id WHERE sc.school_id=%s "
                       f"AND cl.state<>'removed' ORDER BY cl.day, cl.start_min LIMIT %s", (o["school_id"], SAMPLE))
    return rows


def _shared(o: dict, uid: int, current: dict, locations: list[str]) -> dict | None:
    """The layout most schoolmates saved for the same school, if it differs from yours and fits your rooms.
    Only titles and structure travel; Untis origins only (a calendar link is yours alone)."""
    if o["kind"] != "untis":
        return None
    counts, layouts = Counter(), {}
    for r in db.rows("SELECT layout FROM detail_layouts WHERE origin=%s AND user_id<>%s ORDER BY updated_at DESC "
                     "LIMIT %s", (o["origin"], uid, SHARED_SAMPLE)):
        try:
            layout = details.clean(db.unjs(r["layout"], {}))
        except details.Invalid:
            continue
        key = details.canonical(layout)
        counts[key] += 1
        layouts[key] = layout
    for key, n in counts.most_common(3):
        if key != details.canonical(current) and details.fits(layouts[key], locations) >= details.MIN_SHARE:
            return {"layout": layouts[key], "users": n}
    return None


def entry(uid: int, o: dict) -> dict:
    rows = _sample(o)
    locations = list(dict.fromkeys(r["location"] for r in rows if r["location"]))
    detected = details.detect(locations, any(r["group"] for r in rows))
    saved = db.one("SELECT layout FROM detail_layouts WHERE user_id=%s AND origin=%s", (uid, o["origin"]))
    layout = detected
    if saved:
        try:
            layout = details.clean(db.unjs(saved["layout"], {}))
        except details.Invalid:
            saved = None
    return {"origin": o["origin"], "kind": o["kind"], "name": o["name"], "saved": bool(saved), "layout": layout,
            "detected": detected, "suggested": _shared(o, uid, layout, locations),
            "examples": details.examples(rows), "syncing": not rows}


def _mine(uid: int, origin: str) -> dict:
    o = next((x for x in origins(uid) if x["origin"] == origin), None)
    if o is None:
        raise ApiError(404, "not_found")
    return o


@router.get("")
def my_details(request: Request, ctx: Ctx = Depends(auth)):
    """Per origin: the layout to use (yours, or what we suggest), what we found, what schoolmates use and a few
    of your lessons to show it on."""
    return etag_json(request, {"origins": [entry(ctx.uid, o) for o in origins(ctx.uid)]})


@router.put("/{origin}")
def save(origin: str, body: LayoutIn, ctx: Ctx = Depends(auth)):
    """'Looks right': saves your layout for this origin (also when it's exactly what we suggested, so it stays
    as it is when more lessons come in)."""
    o = _mine(ctx.uid, origin)
    try:
        layout = details.clean(body.layout)
    except details.Invalid:
        raise ApiError(400, "invalid")
    db.run("INSERT INTO detail_layouts (user_id, origin, layout) VALUES (%s,%s,%s) "
           "ON DUPLICATE KEY UPDATE layout=VALUES(layout)", (ctx.uid, origin, db.js(layout)))
    return {"origin": entry(ctx.uid, o)}
