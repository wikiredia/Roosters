"""Laadt alles wat de logica nodig heeft voor één dag uit de database."""
import datetime as dt

from . import db
from .config import TZ
from .logic import PersonDay, day_info


def now_local():
    return dt.datetime.now(TZ)


def now_min() -> int:
    n = now_local()
    return n.hour * 60 + n.minute


def groups_by_person():
    out = {}
    for r in db.rows(
        "SELECT gm.person_id, g.id, g.kind, g.name FROM group_members gm "
        "JOIN user_groups g ON g.id=gm.group_id AND g.deleted_at IS NULL"
    ):
        out.setdefault(r["person_id"], []).append(r)
    return out


def load(day: dt.date):
    """-> (people: {id: PersonDay}, infos: {id: DayInfo}, campus_names: {gid: name})"""
    people = {r["id"]: PersonDay(r["id"], r["name"]) for r in db.rows(
        "SELECT id, name FROM people WHERE deleted_at IS NULL")}
    campus_names = {}
    for pid, gs in groups_by_person().items():
        p = people.get(pid)
        if not p:
            continue
        for g in gs:
            getattr(p, {"campus": "campus", "home": "home", "friends": "friends"}[g["kind"]]).add(g["id"])
            if g["kind"] == "campus":
                campus_names[g["id"]] = g["name"]
    hidden = {}
    for r in db.rows("SELECT person_id, course FROM hidden_courses"):
        hidden.setdefault(r["person_id"], set()).add(r["course"])
    seen = set()
    for r in db.rows(
        "SELECT l.person_id, l.start_min, l.end_min, l.course FROM lessons l "
        "JOIN sources s ON s.id=l.source_id AND s.deleted_at IS NULL "
        "WHERE l.day=%s AND l.state NOT IN ('cancelled','removed')", (day,)
    ):
        p = people.get(r["person_id"])
        if not p or r["course"] in hidden.get(p.id, ()):
            continue
        key = (p.id, r["start_min"], r["end_min"], r["course"])
        if key in seen:
            continue
        seen.add(key)
        p.lessons.append((r["start_min"], r["end_min"]))
    for r in db.rows("SELECT * FROM checkins WHERE day=%s AND status<>'skip'", (day,)):
        p = people.get(r["person_id"])
        if p:
            p.checkin = {
                "status": r["status"], "since_min": r["since_min"], "until_min": r["until_min"],
                "with_ids": db.unjs(r["with_ids"], []), "with_text": r["with_text"],
            }
    infos = {pid: day_info(p) for pid, p in people.items()}
    return people, infos, campus_names


def relevant(me: PersonDay, other: PersonDay, scope: str) -> bool:
    """Mag 'other' meldingen voor 'me' veroorzaken? scope: vrienden | campus | iedereen"""
    if scope == "iedereen":
        return True
    if me.friends & other.friends:
        return True
    return scope == "campus" and bool(me.campus & other.campus)
