"""Fetching timetables and updating lessons, with change detection.

Untis classes are fetched once per class (class_lessons) and shared by everyone who follows the class;
personal calendar links per source (source_lessons). Both go through the same `apply`."""
import datetime as dt
import hashlib
import logging
import zoneinfo

from . import config, crypto, db, ics, jobs, notifications, terms, untis
from .netfetch import FetchError, fetch

log = logging.getLogger("roosters.sync")

FIELDS = ("day", "start_min", "end_min", "course", "location", "state")
# Changes worth a notification: today and tomorrow (school timezone)
NOTIFY_DAYS = 2


class SyncError(Exception):
    pass


def tz_of(name: str | None):
    try:
        return zoneinfo.ZoneInfo(name) if name else config.TZ
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        return config.TZ


def fingerprint(l: dict) -> str:
    raw = "|".join(str(l.get(k) or "") for k in FIELDS + ("student_group",))
    return hashlib.sha1(raw.encode()).hexdigest()


def apply(c, table: str, owner_col: str, owner_id: int, lessons: list[dict], *, first: bool, today: dt.date,
          extra: dict | None = None) -> list[dict]:
    """Writes lessons of one owner (a class or a source) and returns what changed.
    `first`: the very first successful fetch, then nothing counts as a change."""
    extra = extra or {}
    now = db.utcnow()
    changes = []
    existing = {r["uid"]: r for r in db.rows(
        f"SELECT id, uid, day, start_min, end_min, course, location, state, fingerprint FROM {table} "
        f"WHERE {owner_col}=%s AND day>=%s", (owner_id, today - dt.timedelta(days=1)), c)}
    cols = [owner_col, *extra, "uid", "day", "start_min", "end_min", "course", "location", "state", "fingerprint",
            "changed_at"]
    if table == "class_lessons":
        cols.insert(-2, "student_group")
    insert = (f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) "
              "ON DUPLICATE KEY UPDATE day=VALUES(day)")
    seen = set()
    for l in lessons:
        if l["day"] < today - dt.timedelta(days=1):
            continue
        seen.add(l["uid"])
        fp = fingerprint(l)
        old = existing.get(l["uid"])
        if old is None:
            changed = None if first or l["day"] < today else now
            values = [owner_id, *extra.values(), l["uid"], l["day"], l["start_min"], l["end_min"], l["course"],
                      l.get("location"), l["state"], fp, changed]
            if table == "class_lessons":
                values.insert(-2, l.get("student_group"))
            db.run(insert, values, c)
            if changed:
                changes.append({"type": "new", **_side(l)})
        elif old["fingerprint"] != fp:
            sets = "day=%s, start_min=%s, end_min=%s, course=%s, location=%s, state=%s, fingerprint=%s, changed_at=%s"
            values = [l["day"], l["start_min"], l["end_min"], l["course"], l.get("location"), l["state"], fp,
                      now if l["day"] >= today else None]
            if table == "class_lessons":
                sets += ", student_group=%s"
                values.append(l.get("student_group"))
            db.run(f"UPDATE {table} SET {sets} WHERE id=%s", (*values, old["id"]), c)
            if l["day"] >= today:
                kind = "cancelled" if l["state"] == "cancelled" and old["state"] != "cancelled" else "changed"
                changes.append({"type": kind, **_side(l), "old": _side(old)})
    # Lessons that disappeared: show them as cancelled instead of silently dropping them.
    # A completely empty answer while there were lessons is suspicious (outage): then remove nothing.
    future_old = [r for r in existing.values() if r["day"] >= today]
    if lessons or len(future_old) < 5:
        horizon = max((l["day"] for l in lessons), default=today + dt.timedelta(days=13))
        for uid, r in existing.items():
            if uid in seen or r["state"] == "removed" or r["day"] < today or r["day"] > horizon:
                continue
            db.run(f"UPDATE {table} SET state='removed', changed_at=%s WHERE id=%s", (now, r["id"]), c)
            changes.append({"type": "cancelled", **_side(r)})
    # Class lessons stay for the school year (scrolling back); calendar links only keep a week
    keep = config.KEEP_PAST_DAYS if table == "class_lessons" else 7
    db.run(f"DELETE FROM {table} WHERE {owner_col}=%s AND day < %s", (owner_id, today - dt.timedelta(days=keep)), c)
    return changes


def _side(l: dict) -> dict:
    return {"day": l["day"], "start_min": l["start_min"], "end_min": l["end_min"], "course": l["course"],
            "location": l.get("location")}


def wanted(course: str, cfg: dict, hidden: set) -> bool:
    """Does this user follow this course? (include = only these, exclude = not these, hidden = hidden in the app)"""
    include, exclude = cfg.get("include") or [], cfg.get("exclude") or []
    if include and course not in include:
        return False
    return course not in exclude and course not in hidden


def _notify(user_id: int, changes: list[dict], today: dt.date, c=None):
    """Only today and tomorrow are worth a notification."""
    for ch in changes:
        if not today <= ch["day"] < today + dt.timedelta(days=NOTIFY_DAYS):
            continue
        payload = {k: (v.isoformat() if isinstance(v, dt.date) else v) for k, v in ch.items() if k != "old"}
        if ch.get("old"):
            payload["old"] = {k: (v.isoformat() if isinstance(v, dt.date) else v) for k, v in ch["old"].items()}
        notifications.enqueue(
            user_id, "schedule_change",
            f"change:{ch['day']}:{ch['start_min']}:{ch['course']}:{ch['type']}:{ch.get('location')}:{ch['end_min']}",
            payload, ch["day"], c=c)


def _hidden(user_ids, c=None) -> dict[int, set]:
    out = {uid: set() for uid in user_ids}
    ph, args = db.in_list(user_ids)
    for r in db.rows(f"SELECT user_id, course FROM hidden_courses WHERE user_id IN ({ph})", args, c):
        out[r["user_id"]].add(r["course"])
    return out


# ---- Untis classes ---------------------------------------------------------------

def sync_class(class_id: int) -> list[dict]:
    cls = db.one(
        "SELECT sc.*, s.untis_server, s.untis_login, s.tz, s.year_start, s.s2_start, s.year_end "
        "FROM school_classes sc JOIN schools s ON s.id=sc.school_id WHERE sc.id=%s", (class_id,))
    if cls is None or not cls["untis_server"]:
        return []
    today = dt.datetime.now(tz_of(cls["tz"])).date()
    try:
        lessons = untis.fetch_class(cls["untis_server"], cls["untis_login"] or "", cls["untis_id"], today=today)
    except untis.UntisError as e:
        db.run("UPDATE school_classes SET last_sync=UTC_TIMESTAMP(), last_error=%s WHERE id=%s", (str(e)[:500], class_id))
        raise SyncError(str(e))
    with db.tx() as c:
        changes = apply(c, "class_lessons", "school_class_id", class_id, lessons, first=cls["last_ok"] is None,
                        today=today)
        db.run("UPDATE school_classes SET last_sync=UTC_TIMESTAMP(), last_ok=UTC_TIMESTAMP(), last_error=NULL "
               "WHERE id=%s", (class_id,), c)
        monday = today - dt.timedelta(days=today.weekday())
        db.many("INSERT INTO class_weeks (school_class_id, monday, fetched_at) VALUES (%s,%s,UTC_TIMESTAMP()) "
                "ON DUPLICATE KEY UPDATE fetched_at=VALUES(fetched_at), error=NULL",
                [(class_id, monday + dt.timedelta(weeks=w)) for w in range(config.WEEKS_AHEAD)], c)
        if changes:
            subs = db.rows("SELECT user_id, config, semester FROM sources WHERE school_class_id=%s AND kind='untis' "
                           "AND deleted_at IS NULL", (class_id,), c)
            hidden = _hidden([s["user_id"] for s in subs], c)
            for s in subs:
                cfg = db.unjs(s["config"], {}) or {}
                # A class followed in one semester only: changes in the other one aren't yours
                mine = [ch for ch in changes if wanted(ch["course"], cfg, hidden[s["user_id"]])
                        and terms.covers(s["semester"], cls, ch["day"])]
                _notify(s["user_id"], mine, today, c)
    return changes


def refresh_classes(school_id: int) -> int:
    """Updates the list of classes of a school from Untis: asked for a day in each semester, so a class
    that only exists in S2 can be picked in S1 already. A semester Untis can't answer for (school year
    not planned yet) marks every class as being in it: better too many to pick from than none."""
    school = db.one("SELECT * FROM schools WHERE id=%s", (school_id,))
    if school is None or not school["untis_server"]:
        return 0
    today = dt.datetime.now(tz_of(school["tz"])).date()
    year = terms.school_year(school, today)
    per_sem, errors = {}, []
    for sem in (1, 2):
        first, last = year.range(sem)
        # The semester we're in: today (what Untis shows now); the other one: a few weeks in
        day = today if first <= today <= last else min(first + dt.timedelta(days=21), last)
        try:
            per_sem[sem] = untis.list_classes(school["untis_server"], school["untis_login"] or "", day)
        except untis.UntisError as e:
            errors.append(str(e))
    if not per_sem:
        raise SyncError(errors[0])
    found = {}
    for sem, xs in per_sem.items():
        for x in xs:
            found.setdefault(x["untis_id"], {**x, "sems": set()})["sems"].add(sem)
    rows = [(school_id, x["untis_id"], x["name"], x["long_name"], int(1 in x["sems"] or 1 not in per_sem),
             int(2 in x["sems"] or 2 not in per_sem)) for x in found.values()]
    with db.tx() as c:
        db.run("UPDATE school_classes SET active=0 WHERE school_id=%s", (school_id,), c)
        db.many("INSERT INTO school_classes (school_id, untis_id, name, long_name, in_s1, in_s2, active) "
                "VALUES (%s,%s,%s,%s,%s,%s,1) "
                "ON DUPLICATE KEY UPDATE name=VALUES(name), long_name=VALUES(long_name), in_s1=VALUES(in_s1), "
                "in_s2=VALUES(in_s2), active=1, updated_at=UTC_TIMESTAMP()", rows, c)
        db.run("UPDATE schools SET classes_synced_at=UTC_TIMESTAMP() WHERE id=%s", (school_id,), c)
    return len(found)


def scan_courses(class_id: int) -> int:
    """All courses of a class in the whole school year, per semester (class_courses): one Untis request
    per week, past weeks of the year included. Onboarding picks from this list, so a course that only
    starts later in the year can be chosen now. A few weeks that fail are skipped; most failing = retry."""
    cls = db.one(
        "SELECT sc.*, s.untis_server, s.untis_login, s.tz, s.year_start, s.s2_start, s.year_end "
        "FROM school_classes sc JOIN schools s ON s.id=sc.school_id WHERE sc.id=%s", (class_id,))
    if cls is None or not cls["untis_server"]:
        return 0
    today = dt.datetime.now(tz_of(cls["tz"])).date()
    year = terms.school_year(cls, today)
    monday = year.start - dt.timedelta(days=year.start.weekday())
    weeks = min((year.end - monday).days // 7 + 1, config.SCAN_MAX_WEEKS)
    found: dict[tuple[int, str], dict] = {}
    failed = []
    for w in range(weeks):
        try:
            lessons = untis.fetch_week(cls["untis_server"], cls["untis_login"] or "", cls["untis_id"],
                                       monday + dt.timedelta(weeks=w))
        except untis.UntisError as e:
            failed.append(str(e))
            continue
        for l in lessons:
            sem = year.semester(l["day"])
            if sem is None or l["state"] == "cancelled":
                continue
            f = found.setdefault((sem, l["course"]), {"lessons": 0, "first": l["day"], "last": l["day"]})
            f["lessons"] += 1
            f["first"], f["last"] = min(f["first"], l["day"]), max(f["last"], l["day"])
    if failed and len(failed) * 2 > weeks:
        db.run("UPDATE school_classes SET courses_error=%s WHERE id=%s", (failed[0][:500], class_id))
        raise SyncError(failed[0])
    with db.tx() as c:
        db.run("DELETE FROM class_courses WHERE school_class_id=%s", (class_id,), c)
        db.many("INSERT INTO class_courses (school_class_id, semester, course, lessons, first_day, last_day) "
                "VALUES (%s,%s,%s,%s,%s,%s)",
                [(class_id, sem, course, min(f["lessons"], 32000), f["first"], f["last"])
                 for (sem, course), f in found.items()], c)
        db.run("UPDATE school_classes SET courses_scanned_at=UTC_TIMESTAMP(), courses_error=NULL WHERE id=%s",
               (class_id,), c)
    return len(found)


def synced_weeks(today: dt.date) -> tuple[dt.date, dt.date]:
    """First and last Monday the routine sync keeps fresh."""
    monday = today - dt.timedelta(days=today.weekday())
    return monday, monday + dt.timedelta(weeks=config.WEEKS_AHEAD - 1)


def fetch_class_week(class_id: int, monday: dt.date):
    """One week of a class on demand (scrolling far back or ahead): stored in class_lessons like the
    routine sync, but without notifications (nobody needs a 'change' for a week in March). Lessons of
    that week that Untis no longer has are marked removed, unless the answer is suspiciously empty."""
    cls = db.one("SELECT sc.*, s.untis_server, s.untis_login FROM school_classes sc "
                 "JOIN schools s ON s.id=sc.school_id WHERE sc.id=%s", (class_id,))
    if cls is None or not cls["untis_server"]:
        return
    try:
        lessons = untis.fetch_week(cls["untis_server"], cls["untis_login"] or "", cls["untis_id"], monday)
    except untis.UntisError as e:
        db.run("INSERT INTO class_weeks (school_class_id, monday, fetched_at, error) VALUES (%s,%s,UTC_TIMESTAMP(),%s) "
               "ON DUPLICATE KEY UPDATE error=VALUES(error)", (class_id, monday, str(e)[:500]))
        raise SyncError(str(e))
    sunday = monday + dt.timedelta(days=6)
    with db.tx() as c:
        existing = {r["uid"]: r for r in db.rows(
            "SELECT id, uid, state, fingerprint FROM class_lessons WHERE school_class_id=%s AND day BETWEEN %s AND %s",
            (class_id, monday, sunday), c)}
        for l in lessons:
            fp = fingerprint(l)
            old = existing.get(l["uid"])
            if old is None:
                db.run("INSERT INTO class_lessons (school_class_id, uid, day, start_min, end_min, course, location, "
                       "student_group, state, fingerprint) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                       "ON DUPLICATE KEY UPDATE day=VALUES(day)",
                       (class_id, l["uid"], l["day"], l["start_min"], l["end_min"], l["course"], l.get("location"),
                        l.get("student_group"), l["state"], fp), c)
            elif old["fingerprint"] != fp:
                db.run("UPDATE class_lessons SET day=%s, start_min=%s, end_min=%s, course=%s, location=%s, "
                       "student_group=%s, state=%s, fingerprint=%s WHERE id=%s",
                       (l["day"], l["start_min"], l["end_min"], l["course"], l.get("location"), l.get("student_group"),
                        l["state"], fp, old["id"]), c)
        if lessons or len(existing) < 5:
            seen = {l["uid"] for l in lessons}
            gone = [r["id"] for uid, r in existing.items() if uid not in seen and r["state"] != "removed"]
            if gone:
                ph, args = db.in_list(gone)
                db.run(f"UPDATE class_lessons SET state='removed' WHERE id IN ({ph})", args, c)
        db.run("INSERT INTO class_weeks (school_class_id, monday, fetched_at) VALUES (%s,%s,UTC_TIMESTAMP()) "
               "ON DUPLICATE KEY UPDATE fetched_at=VALUES(fetched_at), error=NULL", (class_id, monday), c)


# ---- Personal calendar links -----------------------------------------------------

def sync_source(source_id: int) -> list[dict]:
    src = db.one("SELECT s.*, sch.tz FROM sources s JOIN users u ON u.id=s.user_id "
                 "LEFT JOIN schools sch ON sch.id=u.school_id WHERE s.id=%s AND s.deleted_at IS NULL", (source_id,))
    if src is None or src["kind"] != "ics":
        return []
    tz = tz_of(src["tz"])
    today = dt.datetime.now(tz).date()
    try:
        url = crypto.decrypt(src["secret_enc"])
        if not url:
            raise SyncError("the link could not be decrypted (did SECRET_KEY change?)")
        status, _, data = fetch(url, headers={"Accept": "text/calendar, */*"})
        if status != 200:
            raise SyncError(f"the calendar answered with status {status}")
        lessons = ics.parse(data, db.unjs(src["config"], {}) or {}, tz)
    except (FetchError, ics.IcsError, SyncError) as e:
        db.run("UPDATE sources SET last_sync=UTC_TIMESTAMP(), last_error=%s WHERE id=%s", (str(e)[:500], source_id))
        raise SyncError(str(e))
    with db.tx() as c:
        changes = apply(c, "source_lessons", "source_id", source_id, lessons, first=src["last_ok"] is None,
                        today=today, extra={"user_id": src["user_id"]})
        db.run("UPDATE sources SET last_sync=UTC_TIMESTAMP(), last_ok=UTC_TIMESTAMP(), last_error=NULL WHERE id=%s",
               (source_id,), c)
        hidden = _hidden([src["user_id"]], c)[src["user_id"]]
        _notify(src["user_id"], [ch for ch in changes if ch["course"] not in hidden], today, c)
    return changes


# ---- Jobs ------------------------------------------------------------------------

@jobs.handler("sync_class")
def _job_sync_class(p: dict):
    try:
        sync_class(int(p["class_id"]))
    except SyncError as e:
        raise jobs.Retry(str(e), dt.timedelta(minutes=2))


@jobs.handler("sync_source")
def _job_sync_source(p: dict):
    try:
        sync_source(int(p["source_id"]))
    except SyncError as e:
        raise jobs.Retry(str(e), dt.timedelta(minutes=5))


@jobs.handler("refresh_classes")
def _job_refresh_classes(p: dict):
    try:
        refresh_classes(int(p["school_id"]))
    except SyncError as e:
        raise jobs.Retry(str(e), dt.timedelta(minutes=10))


@jobs.handler("scan_courses")
def _job_scan_courses(p: dict):
    try:
        scan_courses(int(p["class_id"]))
    except SyncError as e:
        raise jobs.Retry(str(e), dt.timedelta(minutes=10))


@jobs.handler("fetch_class_week")
def _job_fetch_class_week(p: dict):
    try:
        fetch_class_week(int(p["class_id"]), dt.date.fromisoformat(p["monday"]))
    except SyncError as e:
        raise jobs.Retry(str(e), dt.timedelta(minutes=2))


def queue_week(class_id: int, monday: dt.date, c=None):
    """Someone is looking at that week right now: priority 1."""
    jobs.enqueue("fetch_class_week", {"class_id": class_id, "monday": monday.isoformat()},
                 dedupe=f"fetch_class_week:{class_id}:{monday.isoformat()}", priority=1, max_attempts=2, c=c)


def queue_scan(class_id: int, c=None):
    """After the class's own sync (priority 1): the near weeks come first, the whole year right after."""
    jobs.enqueue("scan_courses", {"class_id": class_id}, dedupe=f"scan_courses:{class_id}", priority=2,
                 max_attempts=3, c=c)


def queue_class(class_id: int, *, soon: bool = False, c=None):
    jobs.enqueue("sync_class", {"class_id": class_id}, dedupe=f"sync_class:{class_id}", priority=1 if soon else 5,
                 max_attempts=3, c=c)


def queue_source(source_id: int, *, soon: bool = False, c=None):
    jobs.enqueue("sync_source", {"source_id": source_id}, dedupe=f"sync_source:{source_id}",
                 priority=1 if soon else 5, max_attempts=3, c=c)


def queue_due(local_hour: int, limit: int = 200) -> int:
    """Schedules syncs for classes and links that are due. Only classes someone follows.
    MOD(id, 15) spreads them out so not everything runs in the same minute."""
    every = config.SYNC_EVERY_DAY if 6 <= local_hour < 22 else config.SYNC_EVERY_NIGHT
    classes = db.rows(
        "SELECT sc.id FROM school_classes sc WHERE EXISTS (SELECT 1 FROM sources s WHERE s.school_class_id=sc.id "
        "AND s.deleted_at IS NULL) AND (sc.last_sync IS NULL OR sc.last_sync < UTC_TIMESTAMP() - INTERVAL "
        "(%s + MOD(sc.id, 15)) MINUTE) ORDER BY sc.last_sync IS NOT NULL, sc.last_sync LIMIT %s", (every, limit))
    for r in classes:
        queue_class(r["id"])
    links = db.rows(
        "SELECT id FROM sources WHERE kind='ics' AND deleted_at IS NULL AND (last_sync IS NULL OR "
        "last_sync < UTC_TIMESTAMP() - INTERVAL (%s + MOD(id, 15)) MINUTE) "
        "ORDER BY last_sync IS NOT NULL, last_sync LIMIT %s", (every, limit))
    for r in links:
        queue_source(r["id"])
    return len(classes) + len(links)
