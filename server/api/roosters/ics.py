"""iCalendar (.ics): Google, iCloud, Outlook, Untis-iCal, ... omzetten naar lessen."""
import datetime as dt
import hashlib

import icalendar
import recurring_ical_events

from .config import TZ

MAX_EVENTS = 3000
DAYS_BACK = 1
DAYS_AHEAD = 21


class IcsError(Exception):
    pass


def _text(v, limit):
    if v is None:
        return None
    s = str(v).strip()
    return s[:limit] if s else None


def _local(value):
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=TZ)
        return value.astimezone(TZ)
    return None  # hele-dag-afspraken zijn geen lessen


def parse(data: bytes, config: dict | None = None) -> list[dict]:
    config = config or {}
    keywords = [k.strip().lower() for k in (config.get("keywords") or []) if k.strip()]
    try:
        cal = icalendar.Calendar.from_ical(data)
    except Exception:
        raise IcsError("Dit is geen geldig agendabestand (.ics).")
    today = dt.datetime.now(TZ).date()
    start = dt.datetime.combine(today - dt.timedelta(days=DAYS_BACK), dt.time(), TZ)
    end = dt.datetime.combine(today + dt.timedelta(days=DAYS_AHEAD), dt.time(), TZ)
    try:
        events = recurring_ical_events.of(cal, skip_bad_series=True).between(start, end)
    except Exception:
        raise IcsError("De herhalende afspraken in deze agenda konden niet gelezen worden.")
    out = []
    for ev in events:
        if len(out) >= MAX_EVENTS:
            break
        s = _local(ev.decoded("DTSTART", None)) if ev.get("DTSTART") else None
        if s is None:
            continue
        e = _local(ev.decoded("DTEND", None)) if ev.get("DTEND") else None
        if e is None:
            dur = ev.decoded("DURATION", None) if ev.get("DURATION") else None
            e = s + (dur if isinstance(dur, dt.timedelta) else dt.timedelta(hours=1))
        title = _text(ev.get("SUMMARY"), 200) or "Afspraak"
        if keywords and not any(k in title.lower() for k in keywords):
            continue
        if str(ev.get("TRANSP", "")).upper() == "TRANSPARENT" and config.get("skip_free"):
            continue
        status = str(ev.get("STATUS", "")).upper()
        # Afspraken over middernacht: per dag knippen
        day = s.date()
        while day <= e.date():
            ds = s if day == s.date() else dt.datetime.combine(day, dt.time(), TZ)
            de = e if day == e.date() else dt.datetime.combine(day, dt.time(23, 59), TZ)
            smin = ds.hour * 60 + ds.minute
            emin = de.hour * 60 + de.minute
            if emin > smin:
                raw_uid = f"{ev.get('UID', '')}|{s.isoformat()}|{day.isoformat()}"
                uid = hashlib.sha1(raw_uid.encode()).hexdigest()
                organizer = ev.get("ORGANIZER")
                teacher = None
                if organizer is not None:
                    teacher = _text(getattr(organizer, "params", {}).get("CN") or str(organizer).replace("mailto:", ""), 255)
                out.append({
                    "uid": uid,
                    "day": day,
                    "start_min": smin,
                    "end_min": emin,
                    "title": title,
                    "course": title,
                    "location": _text(ev.get("LOCATION"), 255),
                    "teacher": teacher,
                    "info": _text(ev.get("DESCRIPTION"), 3000),
                    "extra": {"link": _text(ev.get("URL"), 500)} if ev.get("URL") else {},
                    "state": "cancelled" if status == "CANCELLED" else "normal",
                })
            day += dt.timedelta(days=1)
    return out
