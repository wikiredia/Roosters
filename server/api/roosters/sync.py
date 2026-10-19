"""Roosterbronnen ophalen en de lessen in de database bijwerken (met wijzigingsdetectie)."""
import datetime as dt
import hashlib
import threading

from . import crypto, db, ics, notify, untis
from .config import TZ
from .netfetch import FetchError, fetch

_person_locks: dict[int, threading.Lock] = {}
_locks_guard = threading.Lock()


class SyncError(Exception):
    pass


def _lock_for(person_id: int) -> threading.Lock:
    with _locks_guard:
        return _person_locks.setdefault(person_id, threading.Lock())


def fetch_source(src: dict) -> list[dict]:
    cfg = db.unjs(src.get("config"), {}) or {}
    kind = src["kind"]
    try:
        if kind == "untis":
            return untis.fetch_lessons(cfg)
        if kind == "ics":
            url = crypto.decrypt(src.get("secret_enc"))
            if not url:
                raise SyncError("De link kon niet ontsleuteld worden (is SECRET_KEY veranderd?).")
            status, headers, data = fetch(url, headers={"Accept": "text/calendar, */*"})
            if status != 200:
                raise SyncError(f"De agenda gaf status {status}. Klopt de link nog?")
            return ics.parse(data, cfg)
        if kind == "file":
            return ics.parse(bytes(src.get("file_data") or b""), cfg)
    except (untis.UntisError, ics.IcsError, FetchError) as e:
        raise SyncError(str(e))
    raise SyncError("Onbekend soort bron.")


def _fingerprint(l: dict) -> str:
    raw = "|".join(str(l.get(k) or "") for k in ("day", "start_min", "end_min", "title", "location", "teacher", "state", "info"))
    return hashlib.sha1(raw.encode()).hexdigest()


def _fmt(m: int) -> str:
    return f"{m // 60}:{m % 60:02d}"


def apply(src: dict, lessons: list[dict]) -> list[dict]:
    """Schrijft lessen weg. Geeft de wijzigingen terug (enkel na een eerdere geslaagde sync)."""
    now = db.utcnow()
    today = dt.datetime.now(TZ).date()
    first = src.get("last_ok") is None
    changes = []
    with db.tx() as c:
        existing = {r["uid"]: r for r in db.rows(
            "SELECT id, uid, day, start_min, end_min, title, state, fingerprint FROM lessons WHERE source_id=%s AND day>=%s",
            (src["id"], today - dt.timedelta(days=1)), c)}
        seen = set()
        for l in lessons:
            if l["day"] < today - dt.timedelta(days=1):
                continue
            seen.add(l["uid"])
            fp = _fingerprint(l)
            old = existing.get(l["uid"])
            values = (l["day"], l["start_min"], l["end_min"], l["title"], l["course"], l.get("location"),
                      l.get("teacher"), l.get("info"), db.js(l.get("extra") or {}), l["state"], fp)
            if old is None:
                changed = None if first or l["day"] < today else now
                db.run(
                    "INSERT INTO lessons (source_id, person_id, uid, day, start_min, end_min, title, course, location, teacher, info, extra, state, fingerprint, changed_at) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                    "ON DUPLICATE KEY UPDATE day=VALUES(day)",
                    (src["id"], src["person_id"], l["uid"], *values, changed), c)
                if changed:
                    changes.append({"type": "nieuw", **l})
            elif old["fingerprint"] != fp:
                db.run(
                    "UPDATE lessons SET day=%s, start_min=%s, end_min=%s, title=%s, course=%s, location=%s, teacher=%s, info=%s, extra=%s, state=%s, fingerprint=%s, changed_at=%s WHERE id=%s",
                    (*values, now if l["day"] >= today else None, old["id"]), c)
                if l["day"] >= today:
                    kind = "vervallen" if l["state"] == "cancelled" and old["state"] != "cancelled" else "gewijzigd"
                    changes.append({"type": kind, **l})
        # Lessen die verdwenen zijn: tonen als 'vervallen' i.p.v. stil te verdwijnen.
        # Een volledig lege reeks terwijl er wel lessen waren is verdacht (storing): dan niets weghalen.
        future_old = [r for r in existing.values() if r["day"] >= today]
        if lessons or len(future_old) < 5:
            horizon = max((l["day"] for l in lessons), default=today + dt.timedelta(days=13))
            for uid, r in existing.items():
                if uid in seen or r["state"] == "removed" or r["day"] < today or r["day"] > horizon:
                    continue
                db.run("UPDATE lessons SET state='removed', changed_at=%s WHERE id=%s", (now, r["id"]), c)
                changes.append({"type": "vervallen", "day": r["day"], "start_min": r["start_min"],
                                "end_min": r["end_min"], "title": r["title"]})
        db.run("DELETE FROM lessons WHERE source_id=%s AND day < %s", (src["id"], today - dt.timedelta(days=7)), c)
        db.run("UPDATE sources SET last_sync=%s, last_ok=%s, last_error=NULL, refresh_requested=0 WHERE id=%s",
               (now, now, src["id"]), c)
    _notify_changes(src["person_id"], changes, today)
    return changes


def _notify_changes(person_id: int, changes: list[dict], today: dt.date):
    """Pushmelding over je eigen rooster, maar enkel voor vandaag en morgen."""
    soon = [ch for ch in changes if ch["day"] in (today, today + dt.timedelta(days=1))]
    if not soon:
        return
    hidden = {r["course"] for r in db.rows("SELECT course FROM hidden_courses WHERE person_id=%s", (person_id,))}
    for ch in soon:
        if ch.get("title") in hidden:
            continue
        when = "vandaag" if ch["day"] == today else "morgen"
        what = {"vervallen": "vervalt", "nieuw": "is erbij gekomen", "gewijzigd": "is gewijzigd"}[ch["type"]]
        extra = ""
        if ch["type"] == "gewijzigd" and ch.get("location"):
            extra = f" (lokaal {ch['location']})"
        notify.enqueue(
            person_id, "wijziging",
            f"wijziging:{ch['day']}:{ch['start_min']}:{ch.get('title')}:{ch['type']}:{ch.get('location')}",
            "Roosterwijziging",
            f"{ch.get('title')} om {_fmt(ch['start_min'])} {when} {what}{extra}.",
            {"open": "rooster", "day": ch["day"].isoformat()},
            ch["day"],
        )


def sync_source(src: dict) -> dict:
    try:
        lessons = fetch_source(src)
    except SyncError as e:
        db.run("UPDATE sources SET last_sync=UTC_TIMESTAMP(), last_error=%s, refresh_requested=0 WHERE id=%s",
               (str(e)[:500], src["id"]))
        return {"ok": False, "error": str(e), "changes": []}
    changes = apply(src, lessons)
    return {"ok": True, "count": len(lessons), "changes": changes}


def sync_person(person_id: int) -> dict:
    """Alle bronnen van één persoon (knop 'Vernieuwen')."""
    lock = _lock_for(person_id)
    if not lock.acquire(timeout=60):
        return {"ok": False, "error": "Er loopt al een vernieuwing.", "changes": []}
    try:
        sources = db.rows("SELECT * FROM sources WHERE person_id=%s AND deleted_at IS NULL", (person_id,))
        result = {"ok": True, "changes": [], "errors": []}
        for s in sources:
            r = sync_source(s)
            result["changes"] += r["changes"]
            if not r["ok"]:
                result["errors"].append({"source": s["label"], "error": r["error"]})
        result["ok"] = not result["errors"] or len(result["errors"]) < len(sources)
        return result
    finally:
        lock.release()
