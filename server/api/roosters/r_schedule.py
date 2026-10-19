"""Roosters bekijken, vergelijken, vernieuwen, bronnen toevoegen, vakken uitvinken, agenda-export."""
import datetime as dt
import time
import urllib.parse

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response as RawResponse
from pydantic import BaseModel, Field

from . import access, config, crypto, db, ics, logic, sync, untis
from .access import load_ctx
from .daydata import load as load_day, now_local, now_min
from .netfetch import FetchError, check_url, normalize_url, resolve_public

router = APIRouter(prefix="/api")

_last_refresh: dict[int, float] = {}


def today():
    return now_local().date()


def iso(d):
    return d.isoformat() + "Z" if d else None


def visible_days(person_ids, extra=2):
    """Vandaag + de volgende `extra` dagen waarop iemand van hen les heeft."""
    t = today()
    if not person_ids:
        return [t]
    marks = ",".join(["%s"] * len(person_ids))
    rows = db.rows(
        f"SELECT DISTINCT l.day FROM lessons l JOIN sources s ON s.id=l.source_id AND s.deleted_at IS NULL "
        f"WHERE l.person_id IN ({marks}) AND l.day > %s AND l.day <= %s AND l.state <> 'removed' ORDER BY l.day LIMIT %s",
        (*person_ids, t, t + dt.timedelta(days=30), extra))
    return [t] + [r["day"] for r in rows]


# Soort les (voor de kleuren): eerst in de titel, dan in de extra tekst van Untis/agenda
KIND_WORDS = [
    ("examen", ("examen", "exam", "toets", "test ")),
    ("labo", ("labo", "lab ", "laboratorium", "lab-")),
    ("practicum", ("practicum", "prakti", "pract")),
    ("hoorcollege", ("hoorcollege", "hc ", "hc-", "lecture")),
    ("werkcollege", ("werkcollege", "wc ", "oefenzitting", "oefening", "seminarie", "werksessie", "tutorial")),
    ("theorie", ("theorie", "theory", "th ")),
]


def lesson_kind(title, info, extra=None):
    extra = extra or {}
    for text in (title, info, extra.get("groep") if isinstance(extra, dict) else None):
        t = f" {(text or '').lower()} "
        for kind, words in KIND_WORDS:
            if any(w in t for w in words):
                return kind
    return "les"


def hidden_for(pid):
    return {r["course"] for r in db.rows("SELECT course FROM hidden_courses WHERE person_id=%s", (pid,))}


def lessons_for(pid, days, with_titles=True):
    if not days:
        return {}
    marks = ",".join(["%s"] * len(days))
    rows = db.rows(
        f"SELECT l.* FROM lessons l JOIN sources s ON s.id=l.source_id AND s.deleted_at IS NULL "
        f"WHERE l.person_id=%s AND l.day IN ({marks}) ORDER BY l.day, l.start_min, l.end_min", (pid, *days))
    hidden = hidden_for(pid)
    recent = db.utcnow() - dt.timedelta(hours=36)
    out = {d: [] for d in days}
    seen = set()
    for r in rows:
        if r["course"] in hidden:
            continue
        key = (r["day"], r["start_min"], r["end_min"], r["course"])
        if key in seen:
            continue
        seen.add(key)
        changed = bool(r["changed_at"] and r["changed_at"] > recent)
        day = out[r["day"]]
        # Opeenvolgende lesuren van hetzelfde vak in hetzelfde lokaal = één blok
        prev = day[-1] if day else None
        if (prev and prev["_k"] == (r["title"], r["location"], r["teacher"], r["state"])
                and prev["end"] == r["start_min"]):
            prev["end"] = r["end_min"]
            prev["changed"] = prev["changed"] or changed
            continue
        item = {"id": r["id"], "start": r["start_min"], "end": r["end_min"], "state": r["state"], "changed": changed,
                "kind": lesson_kind(r["title"], r["info"], db.unjs(r["extra"], {})),
                "_k": (r["title"], r["location"], r["teacher"], r["state"])}
        if with_titles:
            item.update({"title": r["title"], "location": r["location"]})
        day.append(item)
    for items in out.values():
        for item in items:
            item.pop("_k", None)
    return out


def sources_summary(pid):
    rows = db.rows("SELECT id, kind, label, last_ok, last_error, last_sync FROM sources WHERE person_id=%s AND deleted_at IS NULL", (pid,))
    return [{"id": r["id"], "kind": r["kind"], "label": r["label"], "last_ok": iso(r["last_ok"]),
             "error": r["last_error"]} for r in rows]


def name_of(pid):
    r = db.one("SELECT name FROM people WHERE id=%s AND deleted_at IS NULL", (pid,))
    if not r:
        raise HTTPException(404, {"code": "noperson", "message": "Die persoon bestaat niet (meer)."})
    return r["name"]


def week_days(pids, weeks=3):
    """Maandag van deze week tot `weeks` weken verder: weekdagen, en weekenddagen met les."""
    t = today()
    begin = t - dt.timedelta(days=t.weekday())
    end = begin + dt.timedelta(weeks=weeks)
    marks = ",".join(["%s"] * len(pids))
    with_lessons = {r["day"] for r in db.rows(
        f"SELECT DISTINCT l.day FROM lessons l JOIN sources s ON s.id=l.source_id AND s.deleted_at IS NULL "
        f"WHERE l.person_id IN ({marks}) AND l.day >= %s AND l.day < %s AND l.state <> 'removed'",
        (*pids, begin, end))}
    out, d = [], begin
    while d < end:
        if d.weekday() < 5 or d in with_lessons:
            out.append(d)
        d += dt.timedelta(days=1)
    return out


@router.get("/schedule/{pid}")
def schedule(pid: int, request: Request, weeks: int = 3):
    ctx = load_ctx(request)
    name = name_of(pid)
    access.need_read(ctx, f"probeerde het rooster van {name} te openen")
    days = week_days([pid], max(1, min(weeks, 6)))
    les = lessons_for(pid, days)
    srcs = sources_summary(pid)
    oks = [s["last_ok"] for s in srcs if s["last_ok"]]
    checkin = db.one("SELECT status, until_min FROM checkins WHERE person_id=%s AND day=%s", (pid, today()))
    return {
        "person": {"id": pid, "name": name},
        "days": [{"day": d.isoformat(), "lessons": les.get(d, [])} for d in days],
        "sources": srcs,
        "updated": max(oks) if oks else None,
        "checkin": checkin,
        "now_min": now_min(),
        "today": today().isoformat(),
    }


@router.get("/lesson/{lid}")
def lesson(lid: int, request: Request):
    ctx = load_ctx(request)
    access.need_read(ctx, "probeerde een les te openen")
    r = db.one("SELECT l.*, s.label AS source_label, s.kind AS source_kind, p.name AS person_name FROM lessons l "
               "JOIN sources s ON s.id=l.source_id JOIN people p ON p.id=l.person_id WHERE l.id=%s", (lid,))
    if not r:
        raise HTTPException(404, {"code": "gone", "message": "Deze les bestaat niet meer."})
    extra = db.unjs(r["extra"], {}) or {}
    return {
        "id": r["id"], "person": {"id": r["person_id"], "name": r["person_name"]},
        "day": r["day"].isoformat(), "start": r["start_min"], "end": r["end_min"],
        "title": r["title"], "course": r["course"], "location": r["location"], "teacher": r["teacher"],
        "info": r["info"], "state": r["state"], "extra": {k: v for k, v in extra.items() if v},
        "changed_at": iso(r["changed_at"]), "source": r["source_label"], "source_kind": r["source_kind"],
    }


@router.post("/refresh/{pid}")
def refresh(pid: int, request: Request):
    ctx = load_ctx(request)
    name = name_of(pid)
    access.need_read(ctx, f"probeerde het rooster van {name} te vernieuwen")
    if ctx.gate and not ctx.approved:
        raise HTTPException(403, {"code": "pending", "message": access.PENDING_MSG})
    access.rate_limit(f"refresh:{ctx.ip}", 30, 600)
    last = _last_refresh.get(pid, 0)
    wait = config.REFRESH_COOLDOWN - (time.time() - last)
    if wait > 0:
        return {"ok": True, "skipped": True, "cooldown": int(wait), "changes": 0, "errors": []}
    _last_refresh[pid] = time.time()
    res = sync.sync_person(pid)
    return {"ok": res["ok"], "changes": len(res["changes"]), "errors": res.get("errors", []),
            "cooldown": config.REFRESH_COOLDOWN}


@router.get("/compare")
def compare(ids: str, request: Request):
    ctx = load_ctx(request)
    access.need_read(ctx, "probeerde roosters te vergelijken")
    try:
        pids = sorted({int(x) for x in ids.split(",") if x.strip()})[:60]
    except ValueError:
        raise HTTPException(400, {"code": "ids", "message": "Ongeldige selectie."})
    if not pids:
        raise HTTPException(400, {"code": "ids", "message": "Kies minstens één persoon."})
    t = today()
    days = visible_days(pids, extra=5)
    now = now_min()
    ends = [l["end"] for les in (lessons_for(pid, [t], with_titles=False).get(t, []) for pid in pids) for l in les
            if l["state"] not in ("cancelled", "removed")]
    if len(days) > 1 and (not ends or max(ends) <= now):
        days = days[1:]  # vandaag is voorbij: begin bij de volgende lesdag
    out_days = []
    for d in days:
        people, infos, _ = load_day(d)
        if d != t:
            # check-ins gelden enkel voor vandaag
            for p in people.values():
                p.checkin = None
            infos = {pid: logic.day_info(p) for pid, p in people.items()}
        rows = []
        present = []
        for pid in pids:
            p = people.get(pid)
            if not p:
                continue
            les = lessons_for(pid, [d], with_titles=False).get(d, [])
            info = infos[pid]
            rows.append({"id": pid, "name": p.name, "blocks": les, "free": info.free, "present": info.present,
                         "checkin": p.checkin["status"] if p.checkin else None})
            if info.present:
                present.append(info.free)
        together = []
        if len(present) >= 2:
            cur = present[0]
            for fr in present[1:]:
                cur = logic.overlaps(cur, fr)
            together = [(s, e) for s, e in cur if e - s >= logic.SAME_CAMPUS_MIN]
        out_days.append({"day": d.isoformat(), "people": rows, "together": together})
    return {"days": out_days, "now_min": now_min(), "today": t.isoformat()}


# ---- Bronnen -----------------------------------------------------------------

def _may_add_source(ctx):
    """Goedgekeurd, of wachtend maar voor een nieuwe persoon zonder goedgekeurde toestellen."""
    if not ctx.person_id:
        raise HTTPException(400, {"code": "noperson", "message": "Kies eerst wie je bent."})
    if ctx.device["status"] in ("denied", "blocked"):
        raise HTTPException(403, {"code": "blocked", "message": "Dit toestel heeft geen toegang."})
    if ctx.approved:
        return True
    others = db.one("SELECT COUNT(*) AS n FROM devices WHERE person_id=%s AND status='approved'", (ctx.person_id,))["n"]
    has = db.one("SELECT COUNT(*) AS n FROM sources WHERE person_id=%s AND deleted_at IS NULL", (ctx.person_id,))["n"]
    # Bronnen van vóór dit toestel = iemand anders zijn rooster (bv. een geïmporteerde persoon)
    older = db.one("SELECT COUNT(*) AS n FROM sources WHERE person_id=%s AND deleted_at IS NULL AND created_at < %s",
                   (ctx.person_id, ctx.device["created_at"]))["n"]
    if others or older or has >= 3:
        raise HTTPException(403, {"code": "pending", "message": access.PENDING_MSG})
    return False


def _after_add(ctx, sid, synced: bool, label: str):
    access.log_activity(ctx.device, f"voegde een rooster toe: {label}")
    src = db.one("SELECT * FROM sources WHERE id=%s", (sid,))
    if not synced:
        return {"ok": True, "id": sid, "waiting": True,
                "message": "Opgeslagen. We halen je rooster op zodra Reda je toegang geeft."}
    res = sync.sync_source(src)
    if not res["ok"]:
        return {"ok": False, "id": sid, "error": res["error"]}
    return {"ok": True, "id": sid, "count": res["count"]}


class IcsIn(BaseModel):
    url: str = Field(max_length=2000)
    label: str | None = Field(default=None, max_length=80)
    keywords: list[str] = Field(default_factory=list, max_length=20)


def _label_for_url(url):
    host = urllib.parse.urlsplit(url).hostname or ""
    if "google" in host:
        return "Google Agenda"
    if "icloud" in host:
        return "iCloud-agenda"
    if "outlook" in host or "office365" in host or "live.com" in host:
        return "Outlook-agenda"
    if "webuntis" in host:
        return "Untis (iCal)"
    return host or "Agenda"


@router.post("/sources/ics")
def add_ics(body: IcsIn, request: Request):
    ctx = load_ctx(request)
    approved = _may_add_source(ctx)
    access.rate_limit(f"addsrc:{ctx.ip}", 20, 3600)
    url = normalize_url(body.url)
    try:
        parts = check_url(url)
        resolve_public(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80))
    except FetchError as e:
        raise HTTPException(400, {"code": "url", "message": str(e)})
    label = (body.label or "").strip() or _label_for_url(url)
    cfg = {"keywords": [k.strip()[:40] for k in body.keywords if k.strip()]}
    sid = db.run("INSERT INTO sources (person_id, kind, label, config, secret_enc) VALUES (%s,'ics',%s,%s,%s)",
                 (ctx.person_id, label[:160], db.js(cfg), crypto.encrypt(url)))
    return _after_add(ctx, sid, approved, label)


class UntisIn(BaseModel):
    server: str = Field(max_length=100)
    login: str = Field(max_length=100)
    school: str = Field(max_length=160)
    class_id: int
    class_name: str = Field(max_length=100)


@router.post("/sources/untis")
def add_untis(body: UntisIn, request: Request):
    ctx = load_ctx(request)
    approved = _may_add_source(ctx)
    access.rate_limit(f"addsrc:{ctx.ip}", 20, 3600)
    try:
        server = untis._check_server(body.server)
    except untis.UntisError as e:
        raise HTTPException(400, {"code": "untis", "message": str(e)})
    label = f"Untis · {body.school.split(' - ')[0]} · {body.class_name}"
    cfg = {"server": server, "login": body.login, "school": body.school, "class_id": body.class_id, "class": body.class_name}
    sid = db.run("INSERT INTO sources (person_id, kind, label, config) VALUES (%s,'untis',%s,%s)",
                 (ctx.person_id, label[:160], db.js(cfg)))
    return _after_add(ctx, sid, approved, label)


@router.post("/sources/upload")
async def add_file(request: Request, file: UploadFile = File(...), label: str = Form(default="")):
    ctx = load_ctx(request)
    approved = _may_add_source(ctx)
    access.rate_limit(f"addsrc:{ctx.ip}", 20, 3600)
    data = await file.read(2 * 1024 * 1024 + 1)
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(400, {"code": "size", "message": "Bestand is te groot (max. 2 MB)."})
    try:
        ics.parse(data)
    except ics.IcsError as e:
        raise HTTPException(400, {"code": "ics", "message": str(e)})
    name = (label or "").strip() or (file.filename or "Agendabestand")
    sid = db.run("INSERT INTO sources (person_id, kind, label, config, file_data) VALUES (%s,'file',%s,%s,%s)",
                 (ctx.person_id, f"Bestand · {name}"[:160], db.js({}), data))
    return _after_add(ctx, sid, approved, name)


@router.get("/sources")
def my_sources(request: Request):
    ctx = load_ctx(request)
    if not ctx.person_id:
        return []
    out = []
    for r in db.rows("SELECT * FROM sources WHERE person_id=%s AND deleted_at IS NULL ORDER BY id", (ctx.person_id,)):
        cfg = db.unjs(r["config"], {}) or {}
        detail = ""
        if r["kind"] == "untis":
            detail = f"{cfg.get('school', '')} · klas {cfg.get('class', '')}"
        elif r["kind"] == "ics":
            url = crypto.decrypt(r["secret_enc"]) or ""
            detail = (urllib.parse.urlsplit(url).hostname or "") + (" · enkel: " + ", ".join(cfg["keywords"]) if cfg.get("keywords") else "")
        out.append({"id": r["id"], "kind": r["kind"], "label": r["label"], "detail": detail,
                    "last_ok": iso(r["last_ok"]), "error": r["last_error"],
                    "waiting": r["last_sync"] is None})
    return out


@router.delete("/sources/{sid}")
def delete_source(sid: int, request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    r = db.one("SELECT * FROM sources WHERE id=%s AND deleted_at IS NULL", (sid,))
    if not r or (r["person_id"] != ctx.person_id and not ctx.admin):
        raise HTTPException(404, {"code": "gone", "message": "Bron niet gevonden."})
    db.run("UPDATE sources SET deleted_at=UTC_TIMESTAMP() WHERE id=%s", (sid,))
    return {"ok": True, "undo": access.record(ctx, "source_delete", f"Bron '{r['label']}' verwijderd", {"id": sid})}


@router.get("/untis/schools")
def untis_schools(q: str, request: Request):
    ctx = load_ctx(request)
    access.rate_limit(f"untis:{ctx.ip}", 40, 600)
    try:
        return untis.search_schools(q[:80])
    except untis.UntisError as e:
        raise HTTPException(502, {"code": "untis", "message": f"Untis is niet bereikbaar: {e}"})


@router.get("/untis/classes")
def untis_classes(server: str, login: str, request: Request):
    ctx = load_ctx(request)
    access.rate_limit(f"untis:{ctx.ip}", 40, 600)
    try:
        return untis.list_classes(server, login[:100])
    except untis.UntisError as e:
        raise HTTPException(400, {"code": "untis", "message": str(e)})


# ---- Vakken uitvinken --------------------------------------------------------

@router.get("/courses")
def courses(request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    t = today()
    rows = db.rows(
        "SELECT l.course, COUNT(*) AS n, MIN(CONCAT(l.day, ' ', LPAD(l.start_min, 4, '0'))) AS first FROM lessons l "
        "JOIN sources s ON s.id=l.source_id AND s.deleted_at IS NULL "
        "WHERE l.person_id=%s AND l.day BETWEEN %s AND %s GROUP BY l.course ORDER BY l.course",
        (ctx.person_id, t - dt.timedelta(days=7), t + dt.timedelta(days=30)))
    hidden = hidden_for(ctx.person_id)
    names = {r["course"] for r in rows} | hidden
    counts = {r["course"]: r["n"] for r in rows}
    return [{"course": c, "hidden": c in hidden, "count": counts.get(c, 0)} for c in sorted(names, key=str.lower)]


class CourseIn(BaseModel):
    course: str = Field(max_length=200)
    hidden: bool


@router.post("/courses")
def set_course(body: CourseIn, request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    if body.hidden:
        db.run("INSERT IGNORE INTO hidden_courses (person_id, course) VALUES (%s,%s)", (ctx.person_id, body.course))
    else:
        db.run("DELETE FROM hidden_courses WHERE person_id=%s AND course=%s", (ctx.person_id, body.course))
    label = f"'{body.course}' {'verborgen' if body.hidden else 'weer zichtbaar'}"
    return {"ok": True, "undo": access.record(ctx, "course_hide", label,
                                              {"person_id": ctx.person_id, "course": body.course, "hidden": body.hidden})}


# ---- Agenda-export (eigen rooster in je eigen agenda-app) -------------------

def _feed_url(token):
    return f"{config.BASE_URL}/api/feed/{token}.ics"


@router.get("/feed-link")
def feed_link(request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    r = db.one("SELECT feed_token_enc FROM people WHERE id=%s", (ctx.person_id,))
    tok = crypto.decrypt(r["feed_token_enc"]) if r else None
    if not tok:
        return _new_feed(ctx.person_id)
    return {"url": _feed_url(tok), "webcal": _feed_url(tok).replace("https://", "webcal://").replace("http://", "webcal://")}


def _new_feed(pid):
    tok = crypto.token(24)
    db.run("UPDATE people SET feed_token_hash=%s, feed_token_enc=%s WHERE id=%s", (crypto.sha(tok), crypto.encrypt(tok), pid))
    return {"url": _feed_url(tok), "webcal": _feed_url(tok).replace("https://", "webcal://").replace("http://", "webcal://")}


@router.post("/feed-link/reset")
def feed_reset(request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    return _new_feed(ctx.person_id)


VTIMEZONE = [
    "BEGIN:VTIMEZONE", "TZID:Europe/Brussels",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST",
    "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET",
    "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
    "END:VTIMEZONE",
]


def _ics_escape(s):
    return (s or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@router.get("/feed/{token}.ics")
def feed(token: str, request: Request):
    access.rate_limit(f"feed:{access.client_ip(request)}", 60, 3600)
    if len(token) > 64:
        raise HTTPException(404)
    p = db.one("SELECT id, name FROM people WHERE feed_token_hash=%s AND deleted_at IS NULL", (crypto.sha(token),))
    if not p:
        raise HTTPException(404)
    t = today()
    hidden = hidden_for(p["id"])
    rows = db.rows(
        "SELECT l.* FROM lessons l JOIN sources s ON s.id=l.source_id AND s.deleted_at IS NULL "
        "WHERE l.person_id=%s AND l.day BETWEEN %s AND %s AND l.state <> 'removed' ORDER BY l.day, l.start_min",
        (p["id"], t - dt.timedelta(days=7), t + dt.timedelta(days=30)))
    stamp = db.utcnow().strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Roosters//NL", "CALSCALE:GREGORIAN",
             f"X-WR-CALNAME:Rooster {_ics_escape(p['name'])}", "X-WR-TIMEZONE:Europe/Brussels",
             "REFRESH-INTERVAL;VALUE=DURATION:PT2H", "X-PUBLISHED-TTL:PT2H", *VTIMEZONE]
    seen = set()
    for r in rows:
        if r["course"] in hidden:
            continue
        key = (r["day"], r["start_min"], r["end_min"], r["course"])
        if key in seen:
            continue
        seen.add(key)
        d = r["day"].strftime("%Y%m%d")
        s = f"{d}T{r['start_min'] // 60:02d}{r['start_min'] % 60:02d}00"
        e = f"{d}T{r['end_min'] // 60:02d}{r['end_min'] % 60:02d}00"
        desc = "\n".join(x for x in (r["teacher"] and f"Docent: {r['teacher']}", r["info"]) if x)
        lines += ["BEGIN:VEVENT", f"UID:roosters-{r['id']}@{config.PUBLIC_HOST}", f"DTSTAMP:{stamp}",
                  f"DTSTART;TZID=Europe/Brussels:{s}", f"DTEND;TZID=Europe/Brussels:{e}",
                  f"SUMMARY:{_ics_escape(r['title'])}"]
        if r["location"]:
            lines.append(f"LOCATION:{_ics_escape(r['location'])}")
        if desc:
            lines.append(f"DESCRIPTION:{_ics_escape(desc)}")
        if r["state"] == "cancelled":
            lines.append("STATUS:CANCELLED")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    folded = []
    for line in lines:
        b = line.encode()
        while len(b) > 74:
            cut = 74
            while (b[cut] & 0xC0) == 0x80:
                cut -= 1
            folded.append(b[:cut].decode())
            b = b" " + b[cut:]
        folded.append(b.decode())
    return RawResponse("\r\n".join(folded) + "\r\n", media_type="text/calendar; charset=utf-8",
                       headers={"Cache-Control": "private, max-age=900"})
