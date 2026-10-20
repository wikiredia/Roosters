"""Reading timetables: someone's lessons (from the classes they follow and their own calendar links),
and turning them into the PersonDay objects the break logic in logic.py works with."""
import datetime as dt
from collections import defaultdict

from . import db, logic
from .sync import tz_of, wanted

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
            f"SELECT s.id AS source_id, s.user_id, s.config, cl.day, cl.start_min, cl.end_min, cl.course, cl.location, "
            f"cl.state, cl.changed_at FROM sources s JOIN class_lessons cl ON cl.school_class_id=s.school_class_id "
            f"WHERE s.user_id IN ({ph}) AND s.kind='untis' AND s.deleted_at IS NULL AND cl.day BETWEEN %s AND %s",
            (*args, day_from, day_to)):
        cfg = cfgs.get(r["source_id"])
        if cfg is None:
            cfg = cfgs[r["source_id"]] = db.unjs(r["config"], {}) or {}
        if wanted(r["course"], cfg, hidden[r["user_id"]]):
            out[r["user_id"]].append(r)
    for r in db.rows(
            f"SELECT sl.user_id, sl.day, sl.start_min, sl.end_min, sl.course, sl.location, sl.state, sl.changed_at "
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


def lesson_out(l: dict, detail: bool = True) -> dict:
    """One lesson for the app. Without detail (friend shares only free/busy): only when."""
    item = {"day": l["day"].isoformat(), "start": l["start_min"], "end": l["end_min"],
            "busy": l["state"] not in OFF}
    if detail:
        changed = l.get("changed_at")
        item.update({"course": l["course"], "location": l["location"], "state": l["state"],
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
