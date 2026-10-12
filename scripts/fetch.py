"""Haalt de roosters uit WebUntis (publieke weekweergave, geen login nodig)
en schrijft per persoon enkel de lesblokken (begin/einde) weg naar data.json.
Vaknamen, lokalen en docenten worden niet opgeslagen."""
import datetime as dt
import json
import sys
import time
import urllib.request
import zoneinfo
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "site" / "data.json"

TZ = zoneinfo.ZoneInfo("Europe/Brussels")
SKIP_STATES = {"CANCEL", "FREE"}


def fetch_week(class_id: int, monday: dt.date) -> dict:
    url = (
        f"{cfg['server']}/WebUntis/api/public/timetable/weekly/data"
        f"?elementType=1&elementId={class_id}&date={monday.isoformat()}&formatId=1"
    )
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Roosters GitHub Action)",
        },
    )
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = json.load(r)
            return body["data"]["result"]["data"]
        except Exception as e:  # netwerkfout of onverwacht antwoord: opnieuw proberen
            last = e
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Untis gaf geen bruikbaar antwoord voor klas {class_id}, week {monday}: {last}")


def minutes(hhmm: int) -> int:
    return hhmm // 100 * 60 + hhmm % 100


def merge(intervals):
    merged = []
    for s, e in sorted(intervals):
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return merged


def main():
    today = dt.datetime.now(TZ).date()
    monday = today - dt.timedelta(days=today.weekday())
    weeks = [monday + dt.timedelta(weeks=i) for i in range(cfg.get("weeks", 2))]

    people = {}
    for person in cfg["people"]:
        days: dict[str, list] = {}
        for src in person["sources"]:
            include = set(src.get("include", []))
            exclude = set(src.get("exclude", []))
            for wk in weeks:
                data = fetch_week(src["id"], wk)
                names = {
                    (el["type"], el["id"]): el.get("longName") or el.get("displayname") or el.get("name")
                    for el in data.get("elements", [])
                }
                for p in data.get("elementPeriods", {}).get(str(src["id"]), []):
                    if p.get("cellState") in SKIP_STATES:
                        continue
                    subjects = {names.get((3, el["id"])) for el in p["elements"] if el["type"] == 3}
                    if include and not subjects & include:
                        continue
                    if exclude and subjects & exclude:
                        continue
                    d = str(p["date"])
                    key = f"{d[:4]}-{d[4:6]}-{d[6:]}"
                    days.setdefault(key, []).append((minutes(p["startTime"]), minutes(p["endTime"])))
        people[person["id"]] = {
            "name": person["name"],
            "days": {k: merge(v) for k, v in sorted(days.items())},
        }

    result = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "weeks": [w.isoformat() for w in weeks],
        "people": people,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    total = sum(len(v) for p in people.values() for v in p["days"].values())
    print(f"{out_path}: {total} lesblokken over {len(weeks)} weken")


if __name__ == "__main__":
    main()
