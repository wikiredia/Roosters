"""WebUntis: find a school, list its classes and fetch class timetables (public view, no login).

Compared to v1: one fetch per class for everyone who follows it, all requests to one Untis server
spaced out across all workers, and only what the app needs (no teachers, no free text)."""
import base64
import datetime as dt
import json
import re

from . import config, redisx
from .netfetch import FetchError, fetch

SKIP_STATES = {"FREE"}
STATE_MAP = {
    "CANCEL": "cancelled",
    "SUBSTITUTION": "changed",
    "ROOMSUBSTITUTION": "changed",
    "SHIFT": "changed",
    "ADDITIONAL": "extra",
    "EXAM": "exam",
}
SERVER_RE = re.compile(r"^[a-z0-9-]+(\.[a-z0-9-]+)*\.webuntis\.com$")

# Untis element types
CLASS, SUBJECT, ROOM = 1, 3, 4


class UntisError(Exception):
    pass


def check_server(server: str) -> str:
    server = (server or "").strip().lower()
    if not SERVER_RE.match(server):
        raise UntisError("unknown Untis server")
    return server


def _cookie(login: str) -> str:
    return 'schoolname="_' + base64.b64encode(login.encode()).decode() + '"'


def _get_json(server: str, path: str, login: str | None = None):
    """One request, politely spaced per server. The job queue does the retrying."""
    headers = {"Accept": "application/json"}
    if login:
        headers["Cookie"] = _cookie(login)
    redisx.throttle(f"untis:{server}", config.UNTIS_MIN_INTERVAL)
    try:
        status, _, data = fetch(f"https://{server}{path}", headers=headers, max_bytes=8 * 1024 * 1024)
    except FetchError as e:
        raise UntisError(str(e))
    if status != 200:
        raise UntisError(f"Untis answered with status {status}")
    try:
        return json.loads(data)
    except ValueError:
        raise UntisError("Untis didn't answer with JSON")


def search_schools(query: str) -> list[dict]:
    """Untis' own school search (what the Untis app uses): name, address, server and login name.
    Used by the management console to add a school. Too many matches -> Untis answers an error -> []."""
    query = (query or "").strip()
    if len(query) < 3:
        return []
    body = json.dumps({"id": "roosters", "method": "searchSchool", "params": [{"search": query[:80]}],
                       "jsonrpc": "2.0"}).encode()
    try:
        status, _, data = fetch("https://mobile.webuntis.com/ms/schoolquery2", method="POST", body=body,
                                headers={"Accept": "application/json", "Content-Type": "application/json"},
                                max_bytes=2 * 1024 * 1024)
        res = json.loads(data) if status == 200 else {}
    except (FetchError, ValueError) as e:
        raise UntisError(str(e))
    out = []
    for s in ((res or {}).get("result") or {}).get("schools", [])[:25]:
        try:
            server = check_server(s.get("server", ""))
        except UntisError:
            continue
        out.append({"name": s.get("displayName") or s.get("loginName"), "address": s.get("address") or "",
                    "server": server, "login": s.get("loginName")})
    return out


def list_classes(server: str, login: str) -> list[dict]:
    server = check_server(server)
    day = dt.date.today().isoformat()
    res = _get_json(server, f"/WebUntis/api/public/timetable/weekly/pageconfig?type={CLASS}&date={day}", login)
    elements = ((res or {}).get("data") or {}).get("elements") or []
    if not elements:
        raise UntisError("this school doesn't show public class timetables")
    out = [{"untis_id": int(e["id"]), "name": (e.get("name") or "")[:60], "long_name": (e.get("longName") or "")[:200]}
           for e in elements if e.get("id")]
    out.sort(key=lambda x: x["name"].lower())
    return out


def _week(server: str, login: str, class_id: int, monday: dt.date) -> dict:
    body = _get_json(server, f"/WebUntis/api/public/timetable/weekly/data?elementType={CLASS}&elementId={int(class_id)}"
                             f"&date={monday.isoformat()}&formatId=1", login)
    try:
        return body["data"]["result"]["data"]
    except (KeyError, TypeError):
        raise UntisError("unexpected answer from Untis")


def _minutes(hhmm: int) -> int:
    return hhmm // 100 * 60 + hhmm % 100


def parse_week(data: dict, class_id: int) -> list[dict]:
    """Lessons of one class in one week of Untis data, as normalised dicts."""
    els = {(e["type"], e["id"]): e for e in data.get("elements", [])}

    def names(period, typ, long=True):
        found = []
        for ref in period.get("elements", []):
            if ref.get("type") != typ:
                continue
            e = els.get((typ, ref.get("id")))
            if not e:
                continue
            n = (e.get("longName") if long else None) or e.get("displayname") or e.get("name")
            if n and n not in found:
                found.append(n)
        return found

    out = []
    for p in data.get("elementPeriods", {}).get(str(class_id), []):
        cell = p.get("cellState") or "STANDARD"
        if cell in SKIP_STATES:
            continue
        subjects = names(p, SUBJECT)
        d = str(p["date"])
        course = subjects[0] if subjects else (p.get("lessonText") or "Les")
        out.append({
            "uid": f"{class_id}:{p['id']}",
            "day": dt.date(int(d[:4]), int(d[4:6]), int(d[6:])),
            "start_min": _minutes(p["startTime"]),
            "end_min": _minutes(p["endTime"]),
            "course": course[:200],
            "location": ", ".join(names(p, ROOM, long=False))[:255] or None,
            "student_group": (p.get("studentGroup") or None) and p["studentGroup"][:120],
            "state": STATE_MAP.get(cell, "normal"),
        })
    return out


def fetch_class(server: str, login: str, class_id: int, weeks: int | None = None, today: dt.date | None = None) -> list[dict]:
    """Lessons of one class for this week and the next ones."""
    server = check_server(server)
    today = today or dt.date.today()
    monday = today - dt.timedelta(days=today.weekday())
    out = []
    for w in range(weeks or config.WEEKS_AHEAD):
        out += parse_week(_week(server, login, class_id, monday + dt.timedelta(weeks=w)), class_id)
    return out
