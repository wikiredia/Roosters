"""Backup als zip (JSON per tabel) en terugzetten."""
import base64
import datetime as dt
import decimal
import io
import json
import zipfile

from . import db

TABLES = ["settings", "people", "user_groups", "group_members", "devices", "sources", "lessons", "hidden_courses",
          "checkins", "plans", "plan_members", "travel_prefs", "push_subs", "notify_prefs", "notifications",
          "day_state", "actions"]

README = """Roosters-backup

Terugzetten op de server (vervangt ALLE data):
  sudo ./roosters.sh restore pad/naar/deze.zip

Let op: geheime agenda-links zijn versleuteld met SECRET_KEY uit .env.
Zonder dezelfde SECRET_KEY moeten mensen hun Google/iCloud-link opnieuw toevoegen.
"""


def _enc(v):
    if isinstance(v, dt.datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return str(v)
    if isinstance(v, (bytes, bytearray)):
        return {"__b64": base64.b64encode(bytes(v)).decode()}
    return v


def _dec(v):
    if isinstance(v, dict) and "__b64" in v:
        return base64.b64decode(v["__b64"])
    return v


def make_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("LEESMIJ.txt", README)
        meta = {"made": dt.datetime.now(dt.timezone.utc).isoformat(), "tables": {}}
        for t in TABLES:
            rows = db.rows(f"SELECT * FROM {t}")
            meta["tables"][t] = len(rows)
            z.writestr(f"{t}.json", json.dumps([{k: _enc(v) for k, v in r.items()} for r in rows], ensure_ascii=False))
        z.writestr("meta.json", json.dumps(meta, indent=1))
    return buf.getvalue()


def restore_zip(data: bytes) -> dict:
    counts = {}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = set(z.namelist())
        if "meta.json" not in names:
            raise ValueError("Dit is geen Roosters-backup.")
        with db.tx() as c:
            db.run("SET FOREIGN_KEY_CHECKS=0", c=c)
            for t in TABLES:
                if f"{t}.json" not in names:
                    continue
                rows = json.loads(z.read(f"{t}.json"))
                db.run(f"DELETE FROM {t}", c=c)
                for r in rows:
                    cols = list(r)
                    db.run(f"INSERT INTO {t} ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))})",
                           tuple(_dec(r[k]) for k in cols), c)
                counts[t] = len(rows)
            db.run("SET FOREIGN_KEY_CHECKS=1", c=c)
    return counts
