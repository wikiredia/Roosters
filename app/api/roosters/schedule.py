"""Reading timetables: someone's lessons (from the classes they follow and their own calendar links),
and turning them into the PersonDay objects the break logic in logic.py works with."""
import datetime as dt
from collections import defaultdict

from . import config, db, logic, terms
from .sync import queue_week, synced_weeks, tz_of, wanted

# Lessons that don't take place don't make you busy
OFF = ("cancelled", "removed")
# How long a change stays marked as "new" in the app
RECENT = dt.timedelta(hours=48)


def local_now(user: dict) -> dt.datetime:
    return dt.datetime.now(tz_of(user.get("tz")))


def lessons(user_ids, day_from: dt.date, day_to: dt.date) -> dict[int, list[dict]]:
    """All lessons of these people between two days (inclusive), sorted, without duplicates."""
    user_ids = list(user_ids)
    out: dict[int, list[dict]] = {uid: [] for uid in user_ids}
    if not user_ids:
        return out
    ph, args = db.in_list(user_ids)
    hidden = defaultdict(set)
    for r in db.rows(f"SELECT user_id, course FROM hidden_courses WHERE user_id IN ({ph})", args):
        hidden[r["user_id"]].add(r["course"])
    cfgs = {}
    for r in db.rows(
            f"SELECT s.id AS source_id, s.user_id, s.config, s.semester, sch.year_start, sch.s2_start, sch.year_end, "
            f"cl.day, cl.start_min, cl.end_min, cl.course, cl.location, cl.kind, cl.state, cl.changed_at "
            f"FROM sources s JOIN class_lessons cl ON cl.school_class_id=s.school_class_id "
            f"JOIN school_classes sc ON sc.id=s.school_class_id JOIN schools sch ON sch.id=sc.school_id "
            f"WHERE s.user_id IN ({ph}) AND s.kind='untis' AND s.deleted_at IS NULL AND cl.day BETWEEN %s AND %s",
            (*args, day_from, day_to)):
        cfg = cfgs.get(r["source_id"])
        if cfg is None:
            cfg = cfgs[r["source_id"]] = db.unjs(r["config"], {}) or {}
        # A class followed in one semester only counts on the days of that semester
        if wanted(r["course"], cfg, hidden[r["user_id"]]) and terms.covers(r["semester"], r, r["day"]):
            out[r["user_id"]].append(r)
    for r in db.rows(
            f"SELECT sl.user_id, sl.day, sl.start_min, sl.end_min, sl.course, sl.location, sl.kind, sl.state, sl.changed_at "
            f"FROM source_lessons sl JOIN sources s ON s.id=sl.source_id AND s.deleted_at IS NULL "
            f"WHERE sl.user_id IN ({ph}) AND sl.day BETWEEN %s AND %s", (*args, day_from, day_to)):
        if r["course"] not in hidden[r["user_id"]]:
            out[r["user_id"]].append(r)
    for uid, ls in out.items():
        seen, unique = set(), []
        for l in sorted(ls, key=lambda x: (x["day"], x["start_min"], x["end_min"], x["course"])):
            key = (l["day"], l["start_min"], l["end_min"], l["course"], l["location"])
            if key not in seen:
                seen.add(key)
                unique.append(l)
        out[uid] = unique
    return out


def outside_mondays(day_from: dt.date, day_to: dt.date, today: dt.date) -> list[dt.date]:
    """The Mondays between two days that the routine sync doesn't cover (and aren't too far away)."""
    first, last = synced_weeks(today)
    limit = dt.timedelta(weeks=config.WEEKS_MAX_DISTANCE)
    out = []
    d = day_from - dt.timedelta(days=day_from.weekday())
    while d <= day_to:
        if (d < first or d > last) and abs(d - first) <= limit:
            out.append(d)
        d += dt.timedelta(weeks=1)
    return out


def ensure_weeks(user_ids, day_from: dt.date, day_to: dt.date, today: dt.date) -> bool:
    """Weeks outside the routine sync (far back or ahead) are fetched from Untis when someone looks at
    them. Queues what's missing or stale; True while a week has never been fetched (the app shows a
    skeleton and asks again). A stale week is shown as it is and refreshed in the background."""
    user_ids = list(user_ids)
    if not user_ids:
        return False
    mondays = outside_mondays(day_from, day_to, today)
    if not mondays:
        return False
    ph, args = db.in_list(user_ids)
    classes = [r["school_class_id"] for r in db.rows(
        f"SELECT DISTINCT school_class_id FROM sources WHERE user_id IN ({ph}) AND kind='untis' "
        f"AND deleted_at IS NULL AND school_class_id IS NOT NULL", args)]
    return ensure_class_weeks(classes, mondays, today)


def ensure_class_weeks(classes: list[int], mondays: list[dt.date], today: dt.date) -> bool:
    """`ensure_weeks` for classes directly (a class's own timetable in onboarding)."""
    if not classes or not mondays:
        return False
    first = synced_weeks(today)[0]
    cph, cargs = db.in_list(classes)
    mph, margs = db.in_list(mondays)
    have = {(r["school_class_id"], r["monday"]): r for r in db.rows(
        f"SELECT school_class_id, monday, fetched_at, error FROM class_weeks WHERE school_class_id IN ({cph}) "
        f"AND monday IN ({mph})", (*cargs, *margs))}
    now, loading = db.utcnow(), False
    for cid in classes:
        for m in mondays:
            row = have.get((cid, m))
            if row is None:
                queue_week(cid, m)
                loading = True
            elif row["error"]:
                # Untis said no: try again in an hour, show what we have meanwhile
                if now - row["fetched_at"] > dt.timedelta(hours=1):
                    queue_week(cid, m)
            elif m >= first and now - row["fetched_at"] > dt.timedelta(hours=config.WEEK_STALE_HOURS):
                queue_week(cid, m)
            elif m < first and row["fetched_at"].date() < m + dt.timedelta(days=7):
                # Fetched before that week was over: once more, now that it's final
                queue_week(cid, m)
    return loading


def lesson_out(l: dict, detail: bool = True) -> dict:
    """One lesson for the app. Without detail (friend shares only free/busy): only when."""
    item = {"day": l["day"].isoformat(), "start": l["start_min"], "end": l["end_min"],
            "busy": l["state"] not in OFF}
    if detail:
        changed = l.get("changed_at")
        item.update({"course": l["course"], "location": l["location"], "state": l["state"], "kind": l.get("kind") or "other",
                     "recently_changed": bool(changed and db.utcnow() - changed < RECENT)})
    return item


def busy_only(ls: list[dict]) -> list[dict]:
    """Free/busy view: merged busy blocks, nothing about what or where."""
    by_day = defaultdict(list)
    for l in ls:
        if l["state"] not in OFF:
            by_day[l["day"]].append((l["start_min"], l["end_min"]))
    return [{"day": d.isoformat(), "start": s, "end": e, "busy": True}
            for d in sorted(by_day) for s, e in logic.merge(by_day[d])]


def person_days(users: list[dict], day: dt.date) -> dict[int, logic.PersonDay]:
    """PersonDay per user for one day (lessons that take place + campus + check-in)."""
    ids = [u["id"] for u in users]
    ls = lessons(ids, day, day)
    ph, args = db.in_list(ids)
    checkins = {r["user_id"]: r for r in db.rows(
        f"SELECT * FROM checkins WHERE user_id IN ({ph}) AND day=%s", (*args, day))}
    out = {}
    for u in users:
        out[u["id"]] = logic.PersonDay(
            u["id"], u["display_name"],
            [(l["start_min"], l["end_min"]) for l in ls[u["id"]] if l["state"] not in OFF],
            {u["campus_id"]} if u.get("campus_id") else set(),
            set(), set(),
            checkins.get(u["id"]),
        )
    return out


def status(p: logic.PersonDay, info: logic.DayInfo, now: int) -> dict:
    """Now-board line as codes; the app writes the sentence ("Has a break until 12:30")."""
    b = logic.board_status(p, info, now)
    out = {"code": b["code"], "until": b["until"], "can_ping": b["can_ping"]}
    busy = info.busy
    if b["code"] == "les" and busy:
        last = busy[-1][1]
        nxt = next((s for s, e in info.free if s >= (b["until"] or 0) and e <= last), None)
        out["next_break"] = nxt
    if busy and b["code"] in ("les", "straks", "pauze") and (p.checkin or {}).get("status") not in logic.CHILL:
        out["leaves_at"] = busy[-1][1]
    if info.left_at is not None:
        out["left_at"] = info.left_at
    # Codes in English for the app
    out["code"] = {"les": "in_class", "straks": "later", "pauze": "break", "chill": "chilling", "klaar": "done",
                   "geen": "no_classes", "absent": "absent", "home": "home"}.get(out["code"], out["code"])
    if out["code"] == "chilling" and (p.checkin or {}).get("status") == "want_chill":
        out["code"] = "wants_to_chill"
    return out
