"""Wie ben je, toegang vragen, admin-koppeling, tweede toestel koppelen, eigen toestellen."""
import random
import re

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from . import access, config, crypto, db, geoip, notify
from .access import load_ctx
from .daydata import now_local, now_min

router = APIRouter(prefix="/api")

NAME_RE = re.compile(r"^[\w][\w .'\-]{0,39}$", re.UNICODE)


def visible_people(own_id=None):
    """Namen die verzonnen zijn door wie nog wacht (of geweigerd is) tonen we niet aan anderen."""
    return db.rows(
        "SELECT p.id, p.name FROM people p WHERE p.deleted_at IS NULL AND ("
        " p.id=%s OR NOT EXISTS (SELECT 1 FROM devices d WHERE d.person_id=p.id)"
        " OR EXISTS (SELECT 1 FROM devices d WHERE d.person_id=p.id AND d.status='approved')) ORDER BY p.name",
        (own_id or 0,))


def person_name(pid):
    r = db.one("SELECT name FROM people WHERE id=%s", (pid,)) if pid else None
    return r["name"] if r else None


def me_payload(ctx) -> dict:
    d = ctx.device
    dev = None
    if d:
        dev = {
            "id": d["id"], "status": d["status"], "admin": ctx.admin,
            "person": {"id": d["person_id"], "name": person_name(d["person_id"])} if d["person_id"] else None,
            "location_shared": d["lat"] is not None,
        }
    people = [{"id": r["id"], "name": r["name"]} for r in visible_people(ctx.person_id)]
    offer = None
    if not ctx.approved:
        offer = _link_offer(ctx.ip)
    return {
        "device": dev,
        "gate": ctx.gate,
        "can_read": ctx.can_read,
        "secure": config.SECURE,
        "vapid": notify.vapid_public_key(),
        "today": now_local().date().isoformat(),
        "now_min": now_min(),
        "people": people,
        "link_offer": offer,
        "pending_message": access.PENDING_MSG,
    }


@router.get("/me")
def me(request: Request):
    return me_payload(load_ctx(request))


class ClaimIn(BaseModel):
    person_id: int | None = None
    name: str | None = Field(default=None, max_length=40)


@router.post("/claim")
def claim(body: ClaimIn, request: Request, response: Response):
    ctx = load_ctx(request)
    d = ctx.device
    if d and d["status"] in ("denied", "blocked"):
        raise HTTPException(403, {"code": "blocked", "message": "Dit toestel heeft geen toegang."})
    if d and d["person_id"] and d["status"] == "approved" and not ctx.admin:
        raise HTTPException(409, {"code": "locked", "message": f"Dit toestel hoort al bij {person_name(d['person_id'])}. Vraag Reda om het te wijzigen."})
    access.rate_limit(f"claim:{ctx.ip}", 20, 3600)
    created = False
    if body.person_id:
        p = db.one("SELECT id, name FROM people WHERE id=%s AND deleted_at IS NULL", (body.person_id,))
        if not p:
            raise HTTPException(404, {"code": "noperson", "message": "Die persoon bestaat niet meer."})
    else:
        name = " ".join((body.name or "").split())
        if not NAME_RE.match(name):
            raise HTTPException(400, {"code": "name", "message": "Geef een naam van 1 tot 40 letters."})
        p = db.one("SELECT id, name FROM people WHERE LOWER(name)=LOWER(%s) AND deleted_at IS NULL", (name,))
        if not p:
            pid = db.run("INSERT INTO people (name) VALUES (%s)", (name,))
            p = {"id": pid, "name": name}
            created = True
    # Open modus: iedereen mag zichzelf toevoegen. Maar wie een naam kiest die al een goedgekeurd
    # toestel heeft, moet altijd wachten op Reda (of koppelen met het getal), anders kan iemand zich voordoen als een ander.
    taken = (not created and not ctx.admin and db.one(
        "SELECT COUNT(*) AS n FROM devices WHERE person_id=%s AND status='approved' AND id<>%s",
        (p["id"], d["id"] if d else 0))["n"] > 0)
    status = "approved" if ((not ctx.gate and not taken) or ctx.admin) else "pending"
    if d is None:
        d = access.new_device(request, response, person_id=p["id"], status=status)
    else:
        db.run("UPDATE devices SET person_id=%s, status=%s WHERE id=%s", (p["id"], status, d["id"]))
        d = db.one("SELECT * FROM devices WHERE id=%s", (d["id"],))
        request.state.ctx = access.Ctx(d, ctx.gate, ctx.ip)
    if status == "pending":
        if not d["city"]:
            city = geoip.city(ctx.ip)
            if city:
                db.run("UPDATE devices SET city=%s WHERE id=%s", (city, d["id"]))
        access.log_activity(d, f"koos de naam {p['name']}" + (" (nieuw)" if created else ""))
        notify.enqueue(notify.ADMIN, "toegang", f"toegang:{d['id']}:{p['id']}", "Toegangsverzoek",
                       f"{p['name']} wil toegang ({access.device_label(d['ua'])}).", {"open": "admin"})
    return me_payload(load_ctx(request))


class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    acc: float = Field(ge=0, le=100000)


@router.post("/request/location")
def share_location(body: LocationIn, request: Request):
    ctx = load_ctx(request)
    if not ctx.device or ctx.device["status"] != "pending":
        raise HTTPException(400, {"code": "notpending", "message": "Enkel nodig zolang je wacht op toegang."})
    db.run("UPDATE devices SET lat=%s, lon=%s, acc=%s WHERE id=%s",
           (round(body.lat, 6), round(body.lon, 6), int(body.acc), ctx.device["id"]))
    access.log_activity(ctx.device, "deelde zijn/haar locatie")
    return {"ok": True}


# ---- Admin-koppeling (code van `sudo ./roosters.sh admin-code`) -------------

class CodeIn(BaseModel):
    code: str = Field(max_length=20)


@router.post("/admin/pair")
def admin_pair(body: CodeIn, request: Request, response: Response):
    ctx = load_ctx(request)
    access.rate_limit(f"pair:{ctx.ip}", 8, 3600)
    code = re.sub(r"\D", "", body.code)
    row = db.one("SELECT * FROM admin_codes WHERE code_hash=%s AND expires_at > UTC_TIMESTAMP()", (crypto.sha("admin:" + code),))
    if not row:
        raise HTTPException(400, {"code": "badcode", "message": "Die code klopt niet of is verlopen."})
    db.run("DELETE FROM admin_codes WHERE code_hash=%s", (row["code_hash"],))
    if ctx.device is None:
        access.new_device(request, response, status="approved", is_admin=1)
    else:
        db.run("UPDATE devices SET is_admin=1, status='approved', decided_at=UTC_TIMESTAMP(), lat=NULL, lon=NULL, acc=NULL WHERE id=%s",
               (ctx.device["id"],))
        request.state.ctx = None
    return me_payload(load_ctx(request))


# ---- Tweede toestel koppelen (bv. de app op je beginscherm) -----------------

def _link_offer(ip):
    row = db.one("SELECT * FROM link_codes WHERE ip=%s AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() ORDER BY id DESC LIMIT 1", (ip,))
    if not row:
        return None
    return {"options": db.unjs(row["options"], []), "expires_in": int((row["expires_at"] - db.utcnow()).total_seconds())}


@router.post("/link/start")
def link_start(request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    access.rate_limit(f"linkstart:{ctx.device['id']}", 10, 3600)
    db.run("UPDATE link_codes SET used_at=UTC_TIMESTAMP() WHERE device_id=%s AND used_at IS NULL", (ctx.device["id"],))
    numbers = random.sample(range(10, 100), 3)
    number = numbers[0]
    random.shuffle(numbers)
    db.run("INSERT INTO link_codes (device_id, ip, number, options, expires_at) VALUES (%s,%s,%s,%s, UTC_TIMESTAMP() + INTERVAL 5 MINUTE)",
           (ctx.device["id"], ctx.ip, number, db.js(numbers)))
    return {"number": number, "expires_in": 300}


class ChooseIn(BaseModel):
    number: int = Field(ge=10, le=99)


@router.post("/link/choose")
def link_choose(body: ChooseIn, request: Request, response: Response):
    ctx = load_ctx(request)
    if ctx.approved:
        raise HTTPException(400, {"code": "already", "message": "Dit toestel is al gekoppeld."})
    if ctx.device and ctx.device["status"] in ("denied", "blocked"):
        raise HTTPException(403, {"code": "blocked", "message": "Dit toestel heeft geen toegang."})
    access.rate_limit(f"linkchoose:{ctx.ip}", 6, 600)
    row = db.one("SELECT * FROM link_codes WHERE ip=%s AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() ORDER BY id DESC LIMIT 1", (ctx.ip,))
    if not row:
        raise HTTPException(400, {"code": "nolink", "message": "Geen koppeling bezig. Start ze opnieuw op je andere scherm."})
    # Eén poging: fout = koppeling geannuleerd
    db.run("UPDATE link_codes SET used_at=UTC_TIMESTAMP() WHERE id=%s", (row["id"],))
    if body.number != row["number"]:
        raise HTTPException(400, {"code": "wrong", "message": "Fout getal. Start opnieuw op je andere scherm."})
    origin = db.one("SELECT * FROM devices WHERE id=%s AND status='approved'", (row["device_id"],))
    if not origin or not origin["person_id"]:
        raise HTTPException(400, {"code": "nolink", "message": "Het andere toestel heeft geen toegang meer."})
    if ctx.device is None:
        d = access.new_device(request, response, person_id=origin["person_id"], status="approved", linked_from=origin["id"])
    else:
        db.run("UPDATE devices SET person_id=%s, status='approved', linked_from=%s, decided_at=UTC_TIMESTAMP(), lat=NULL, lon=NULL, acc=NULL WHERE id=%s",
               (origin["person_id"], origin["id"], ctx.device["id"]))
        d = db.one("SELECT * FROM devices WHERE id=%s", (ctx.device["id"],))
        request.state.ctx = None
    # 'Ongedaan maken' van een koppeling = het nieuwe toestel weer loskoppelen
    undo = access.record(access.Ctx(origin, ctx.gate, ctx.ip), "device_unlink",
                         f"Koppeling van {access.device_label(d['ua'])} ongedaan maken", {"device_id": d["id"]})
    notify.enqueue(origin["person_id"], "apparaat", f"apparaat:{d['id']}", "Nieuw toestel gekoppeld",
                   f"{access.device_label(d['ua'])} is nu aan jou gekoppeld. Was jij dit niet? Open de app om het ongedaan te maken.",
                   {"open": "home", "undo": undo["id"]}, now_local().date())
    return me_payload(load_ctx(request))


# ---- Eigen toestellen --------------------------------------------------------

@router.get("/devices")
def my_devices(request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    rows = db.rows("SELECT id, ua, created_at, last_seen, status, is_admin FROM devices WHERE person_id=%s ORDER BY last_seen DESC", (ctx.person_id,))
    return [{"id": r["id"], "label": access.device_label(r["ua"]), "this": r["id"] == ctx.device["id"],
             "status": r["status"], "admin": bool(r["is_admin"]),
             "last_seen": r["last_seen"].isoformat() + "Z", "created": r["created_at"].isoformat() + "Z"} for r in rows]


@router.delete("/devices/{device_id}")
def remove_device(device_id: int, request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    d = db.one("SELECT * FROM devices WHERE id=%s", (device_id,))
    if not d or (d["person_id"] != ctx.person_id and not ctx.admin):
        raise HTTPException(404, {"code": "gone", "message": "Toestel niet gevonden."})
    if d["id"] == ctx.device["id"]:
        raise HTTPException(400, {"code": "self", "message": "Je kan dit toestel niet zelf verwijderen."})
    undo = access.record(ctx, "device_delete", f"{access.device_label(d['ua'])} verwijderd", {"row": {k: v for k, v in d.items() if k != "activity"}})
    db.run("DELETE FROM push_subs WHERE device_id=%s", (device_id,))
    db.run("DELETE FROM devices WHERE id=%s", (device_id,))
    return {"ok": True, "undo": undo}


class UndoIn(BaseModel):
    id: int


@router.post("/undo")
def do_undo(body: UndoIn, request: Request):
    ctx = load_ctx(request)
    access.need_read(ctx)
    a = db.one("SELECT * FROM actions WHERE id=%s", (body.id,))
    if a and a["kind"] == "device_unlink":
        # Het gekoppelde toestel weer loskoppelen (mag door de persoon zelf)
        p = db.unjs(a["payload"], {})
        d = db.one("SELECT * FROM devices WHERE id=%s", (p.get("device_id"),))
        if not ctx.admin and (not d or d["person_id"] != ctx.person_id):
            raise HTTPException(403, {"code": "admin", "message": "Dit kan je niet ongedaan maken."})
        if a["undone_at"]:
            raise HTTPException(404, {"code": "gone", "message": "Al ongedaan gemaakt."})
        if d:
            db.run("DELETE FROM push_subs WHERE device_id=%s", (d["id"],))
            db.run("DELETE FROM devices WHERE id=%s", (d["id"],))
        db.run("UPDATE actions SET undone_at=UTC_TIMESTAMP() WHERE id=%s", (a["id"],))
        return {"ok": True, "summary": a["summary"]}
    return access.undo(ctx, body.id)
