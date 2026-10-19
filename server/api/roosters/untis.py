"""WebUntis: scholen zoeken, klassen oplijsten en weekroosters ophalen (publieke weergave, geen login)."""
import base64
import datetime as dt
import json
import re
import time

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

# Klassen die meerdere vrienden delen niet telkens opnieuw ophalen
_cache: dict = {}
CACHE_SECONDS = 600


class UntisError(Exception):
    pass


def _check_server(server: str) -> str:
    server = (server or "").strip().lower()
    if not SERVER_RE.match(server):
        raise UntisError("Onbekende Untis-server.")
    return server


def _cookie(login: str) -> str:
    return 'schoolname="_' + base64.b64encode(login.encode()).decode() + '"'


def _get_json(url: str, login: str | None = None, method="GET", body=None):
    headers = {"Accept": "application/json"}
    if login:
        headers["Cookie"] = _cookie(login)
    if body is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(body).encode()
    last = None
    for attempt in range(3):
        try:
            status, _, data = fetch(url, method=method, body=body, headers=headers, max_bytes=8 * 1024 * 1024)
            if status != 200:
                raise UntisError(f"Untis antwoordde met status {status}.")
            return json.loads(data)
        except (FetchError, UntisError, ValueError) as e:
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise UntisError(str(last))


def search_schools(query: str) -> list[dict]:
    query = (query or "").strip()
    if len(query) < 3:
        return []
    res = _get_json(
        "https://mobile.webuntis.com/ms/schoolquery2",
        method="POST",
        body={"id": "roosters", "method": "searchSchool", "params": [{"search": query}], "jsonrpc": "2.0"},
    )
    if "error" in res:
        # Untis geeft een fout bij te veel resultaten
        return []
    out = []
    for s in (res.get("result") or {}).get("schools", [])[:25]:
        try:
            server = _check_server(s.get("server", ""))
        except UntisError:
            continue
        out.append({
            "name": s.get("displayName") or s.get("loginName"),
            "address": s.get("address") or "",
            "server": server,
            "login": s.get("loginName"),
        })
    return out


def list_classes(server: str, login: str) -> list[dict]:
    server = _check_server(server)
    day = dt.date.today().isoformat()
    res = _get_json(f"https://{server}/WebUntis/api/public/timetable/weekly/pageconfig?type=1&date={day}", login)
    elements = ((res or {}).get("data") or {}).get("elements") or []
    if not elements:
        raise UntisError("Deze school toont geen publieke klasroosters. Gebruik dan je persoonlijke iCal-link uit WebUntis.")
    out = [{"id": e["id"], "name": e.get("name") or "", "long": e.get("longName") or ""} for e in elements]
    out.sort(key=lambda x: x["name"].lower())
    return out


def _minutes(hhmm: int) -> int:
    return hhmm // 100 * 60 + hhmm % 100


def _week(server: str, login: str, class_id: int, monday: dt.date) -> dict:
    key = (server, login, class_id, monday)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    url = (f"https://{server}/WebUntis/api/public/timetable/weekly/data"
           f"?elementType=1&elementId={int(class_id)}&date={monday.isoformat()}&formatId=1")
    body = _get_json(url, login)
    try:
        data = body["data"]["result"]["data"]
    except (KeyError, TypeError):
        raise UntisError("Onverwacht antwoord van Untis.")
    _cache[key] = (time.time(), data)
    if len(_cache) > 500:
        for k in sorted(_cache, key=lambda k: _cache[k][0])[:250]:
            _cache.pop(k, None)
    return data


def fetch_lessons(config: dict, weeks: int = 3) -> list[dict]:
    """Lessen van één klas voor deze en de volgende weken, als genormaliseerde dicts."""
    server = _check_server(config["server"])
    login = config.get("login") or ""
    class_id = int(config["class_id"])
    include = set(config.get("include") or [])
    exclude = set(config.get("exclude") or [])
    today = dt.date.today()
    monday = today - dt.timedelta(days=today.weekday())
    out = []
    for w in range(weeks):
        data = _week(server, login, class_id, monday + dt.timedelta(weeks=w))
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

        for p in data.get("elementPeriods", {}).get(str(class_id), []):
            cell = p.get("cellState") or "STANDARD"
            if cell in SKIP_STATES:
                continue
            subjects = names(p, 3)
            if include and not set(subjects) & include:
                continue
            if exclude and set(subjects) & exclude:
                continue
            d = str(p["date"])
            day = dt.date(int(d[:4]), int(d[4:6]), int(d[6:]))
            title = subjects[0] if subjects else (p.get("lessonText") or "Les")
            info_parts = [p.get(k) for k in ("lessonText", "periodText", "substText", "periodInfo")]
            info = "\n".join(x.strip() for x in info_parts if x and x.strip())
            out.append({
                "uid": f"{class_id}:{p['id']}",
                "day": day,
                "start_min": _minutes(p["startTime"]),
                "end_min": _minutes(p["endTime"]),
                "title": title[:200],
                "course": title[:200],
                "location": ", ".join(names(p, 4))[:255] or None,
                "teacher": ", ".join(names(p, 2, long=False))[:255] or None,
                "info": info or None,
                "extra": {
                    "klassen": names(p, 1, long=False),
                    "lokaal_code": ", ".join(names(p, 4, long=False)),
                    "groep": p.get("studentGroup") or None,
                    "untis_status": cell,
                },
                "state": STATE_MAP.get(cell, "normal"),
            })
    return out
