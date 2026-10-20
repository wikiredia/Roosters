"""Toestellen, cookies, goedkeuring (de 'gate'), snelheidslimieten en ongedaan maken."""
import datetime as dt
import ipaddress
import threading
import time
from dataclasses import dataclass

from fastapi import HTTPException, Request, Response

from . import config, crypto, db


# ---- Snelheidslimieten (in het geheugen; één API-proces) ---------------------
_buckets: dict = {}
_rl_lock = threading.Lock()


def rate_limit(key: str, limit: int, per_seconds: int):
    now = time.time()
    with _rl_lock:
        hits = [t for t in _buckets.get(key, []) if now - t < per_seconds]
        if len(hits) >= limit:
            raise HTTPException(429, {"code": "rate", "message": "Even rustig aan, probeer het zo opnieuw."})
        hits.append(now)
        _buckets[key] = hits
        if len(_buckets) > 20000:
            for k in list(_buckets)[:10000]:
                _buckets.pop(k, None)


def client_ip(request: Request) -> str:
    # Apache overschrijft X-Real-IP altijd met het echte adres
    for candidate in (request.headers.get("x-real-ip"), request.client.host if request.client else None):
        try:
            return str(ipaddress.ip_address((candidate or "").strip()))
        except ValueError:
            continue
    return "?"


def device_label(ua: str | None) -> str:
    ua = ua or ""
    os_ = ("iPhone" if "iPhone" in ua else "iPad" if "iPad" in ua else "Android" if "Android" in ua
           else "Mac" if "Macintosh" in ua else "Windows" if "Windows" in ua else "Linux" if "Linux" in ua else "Toestel")
    br = ("Edge" if "Edg/" in ua else "Firefox" if "Firefox" in ua else "Chrome" if ("Chrome" in ua or "CriOS" in ua)
          else "Safari" if "Safari" in ua else "browser")
    return f"{os_} · {br}"


# ---- Gate --------------------------------------------------------------------

def gate_on() -> bool:
    return db.get_setting("gate", "off") == "on"


@dataclass
class Ctx:
    device: dict | None
    gate: bool
    ip: str

    @property
    def person_id(self):
        return self.device["person_id"] if self.device else None

    @property
    def admin(self) -> bool:
        return bool(self.device and self.device["is_admin"] and self.device["status"] == "approved")

    @property
    def status(self) -> str:
        return self.device["status"] if self.device else "new"

    @property
    def approved(self) -> bool:
        return self.admin or (self.device is not None and self.device["status"] == "approved" and self.person_id is not None)

    @property
    def can_read(self) -> bool:
        if self.device and self.device["status"] in ("denied", "blocked"):
            return False
        return self.approved or not self.gate


def load_ctx(request: Request) -> Ctx:
    cached = getattr(request.state, "ctx", None)
    if cached:
        return cached
    tok = request.cookies.get(config.COOKIE_NAME)
    device = None
    if tok and 20 <= len(tok) <= 100:
        device = db.one("SELECT * FROM devices WHERE token_hash=%s", (crypto.sha(tok),))
        if device:
            ip = client_ip(request)
            last = device["last_seen"]
            if not last or db.utcnow() - last > dt.timedelta(minutes=5) or device["ip"] != ip:
                db.run("UPDATE devices SET last_seen=UTC_TIMESTAMP(), ip=%s, ua=%s WHERE id=%s",
                       (ip, (request.headers.get("user-agent") or "")[:255], device["id"]))
            request.state.renew_token = tok
    ctx = Ctx(device, gate_on(), client_ip(request))
    request.state.ctx = ctx
    return ctx


def set_cookie(response: Response, token: str):
    response.set_cookie(
        config.COOKIE_NAME, token, max_age=config.COOKIE_MAX_AGE, path="/",
        secure=config.SECURE, httponly=True, samesite="lax",
    )


def new_device(request: Request, response: Response, **fields) -> dict:
    rate_limit(f"newdev:{client_ip(request)}", 12, 3600)
    tok = crypto.token(32)
    cols = {"token_hash": crypto.sha(tok), "ip": client_ip(request),
            "ua": (request.headers.get("user-agent") or "")[:255], **fields}
    names = ", ".join(cols)
    marks = ", ".join(["%s"] * len(cols))
    did = db.run(f"INSERT INTO devices ({names}) VALUES ({marks})", tuple(cols.values()))
    set_cookie(response, tok)
    request.state.renew_token = None
    dev = db.one("SELECT * FROM devices WHERE id=%s", (did,))
    request.state.ctx = Ctx(dev, gate_on(), client_ip(request))
    return dev


def log_activity(device: dict | None, text: str):
    """Wat een wachtend toestel probeert te doen, zodat Reda kan zien of het echt die persoon is."""
    if not device or device["status"] != "pending":
        return
    acts = db.unjs(device.get("activity"), []) or []
    entry = {"t": db.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "what": text[:160]}
    if acts and acts[-1].get("what") == entry["what"]:
        return
    acts = (acts + [entry])[-25:]
    db.run("UPDATE devices SET activity=%s WHERE id=%s", (db.js(acts), device["id"]))
    device["activity"] = acts


PENDING_MSG = ("Wacht tot Reda je toegang geeft. PS: Als ik je toegang geef dan kan je dit wel doen, "
               "ik wil mn wifi niet gehackt dus bel ofzo als dit sneller moet gebeuren")


def need_read(ctx: Ctx, what: str | None = None):
    if ctx.device and ctx.device["status"] in ("denied", "blocked"):
        raise HTTPException(403, {"code": "blocked", "message": "Dit toestel heeft geen toegang."})
    if not ctx.can_read:
        if what:
            log_activity(ctx.device, what)
        raise HTTPException(403, {"code": "pending", "message": PENDING_MSG})


def need_person(ctx: Ctx):
    """Schrijven over jezelf: toestel moet aan een persoon hangen en goedgekeurd zijn."""
    need_read(ctx)
    if not ctx.person_id:
        raise HTTPException(400, {"code": "noperson", "message": "Kies eerst wie je bent."})
    if not ctx.approved:
        raise HTTPException(403, {"code": "pending", "message": PENDING_MSG})


def need_admin(ctx: Ctx):
    if not ctx.admin:
        raise HTTPException(403, {"code": "admin", "message": "Alleen voor Reda."})


# ---- Ongedaan maken ----------------------------------------------------------

def record(ctx: Ctx | None, kind: str, summary: str, payload: dict, admin_only=False) -> dict:
    aid = db.run(
        "INSERT INTO actions (device_id, kind, summary, payload, admin_only) VALUES (%s,%s,%s,%s,%s)",
        (ctx.device["id"] if ctx and ctx.device else None, kind, summary[:200], db.js(payload), 1 if admin_only else 0),
    )
    return {"id": aid, "label": summary}


def undo(ctx: Ctx, action_id: int):
    a = db.one("SELECT * FROM actions WHERE id=%s", (action_id,))
    if not a or a["undone_at"]:
        raise HTTPException(404, {"code": "gone", "message": "Dit kan niet meer ongedaan gemaakt worden."})
    mine = ctx.device and a["device_id"] == ctx.device["id"]
    if not ctx.admin and (not mine or a["admin_only"] or db.utcnow() - a["created_at"] > dt.timedelta(hours=24)):
        raise HTTPException(403, {"code": "admin", "message": "Dit kan je niet ongedaan maken."})
    p = db.unjs(a["payload"], {})
    k = a["kind"]
    with db.tx() as c:
        if k == "device_status":
            b = p["before"]
            db.run("UPDATE devices SET status=%s, is_admin=%s, person_id=%s WHERE id=%s",
                   (b["status"], b["is_admin"], b["person_id"], p["device_id"]), c)
        elif k == "device_delete":
            row = p["row"]
            cols = [x for x in row if x not in ("activity",)]
            db.run(f"INSERT IGNORE INTO devices ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))})",
                   tuple(row[x] for x in cols), c)
        elif k in ("source_delete", "group_delete", "person_delete"):
            table = {"source_delete": "sources", "group_delete": "user_groups", "person_delete": "people"}[k]
            db.run(f"UPDATE {table} SET deleted_at=NULL WHERE id=%s", (p["id"],), c)
        elif k == "group_member":
            if p["was_member"]:
                db.run("INSERT IGNORE INTO group_members (group_id, person_id) VALUES (%s,%s)", (p["group_id"], p["person_id"]), c)
            else:
                db.run("DELETE FROM group_members WHERE group_id=%s AND person_id=%s", (p["group_id"], p["person_id"]), c)
        elif k == "checkin":
            db.run("DELETE FROM checkins WHERE person_id=%s AND day=%s", (p["person_id"], p["day"]), c)
            b = p.get("before")
            if b:
                db.run("INSERT INTO checkins (person_id, day, status, since_min, until_min, with_ids, with_text) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                       (p["person_id"], p["day"], b["status"], b["since_min"], b["until_min"], db.js(b.get("with_ids") or []), b.get("with_text")), c)
        elif k == "gate":
            db.run("INSERT INTO settings (k, v) VALUES ('gate', %s) ON DUPLICATE KEY UPDATE v=VALUES(v)", (p["before"],), c)
        elif k == "plan_cancel":
            db.run("UPDATE plans SET cancelled_at=NULL WHERE id=%s", (p["id"],), c)
        elif k == "course_hide":
            if p["hidden"]:
                db.run("DELETE FROM hidden_courses WHERE person_id=%s AND course=%s", (p["person_id"], p["course"]), c)
            else:
                db.run("INSERT IGNORE INTO hidden_courses (person_id, course) VALUES (%s,%s)", (p["person_id"], p["course"]), c)
        elif k == "batch":
            # Beheer 'Opslaan': elke stap terugdraaien, laatste eerst
            for r in reversed(p["reverse"]):
                t = r["t"]
                if t == "group_soft_delete":
                    db.run("UPDATE user_groups SET deleted_at=UTC_TIMESTAMP() WHERE id=%s", (r["id"],), c)
                elif t == "group_restore":
                    db.run("UPDATE user_groups SET deleted_at=NULL WHERE id=%s", (r["id"],), c)
                elif t == "group_name":
                    db.run("UPDATE user_groups SET name=%s WHERE id=%s", (r["name"], r["id"]), c)
                elif t == "person_name":
                    db.run("UPDATE people SET name=%s WHERE id=%s", (r["name"], r["id"]), c)
                elif t == "person_restore":
                    db.run("UPDATE people SET deleted_at=NULL WHERE id=%s", (r["id"],), c)
                elif t == "member":
                    if r["member"]:
                        db.run("INSERT IGNORE INTO group_members (group_id, person_id) VALUES (%s,%s)", (r["group_id"], r["person_id"]), c)
                    else:
                        db.run("DELETE FROM group_members WHERE group_id=%s AND person_id=%s", (r["group_id"], r["person_id"]), c)
        elif k == "travel_pref":
            db.run("DELETE FROM travel_prefs WHERE person_id=%s AND other_id=%s", (p["person_id"], p["other_id"]), c)
            if p.get("before"):
                db.run("INSERT INTO travel_prefs (person_id, other_id, pref) VALUES (%s,%s,%s)", (p["person_id"], p["other_id"], p["before"]), c)
        else:
            raise HTTPException(400, {"code": "unknown", "message": "Onbekende actie."})
        db.run("UPDATE actions SET undone_at=UTC_TIMESTAMP() WHERE id=%s", (action_id,), c)
    return {"ok": True, "summary": a["summary"]}
