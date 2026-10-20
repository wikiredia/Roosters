"""Alles wat enkel Reda mag: toegang, groepen, mensen, backup, certificaat, ongedaan maken."""
import datetime as dt
import threading

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response as RawResponse
from pydantic import BaseModel, Field

from . import access, backup, certstatus, db, notify, sync
from .access import load_ctx

router = APIRouter(prefix="/api/admin")


def _iso(v):
    return v.isoformat() + "Z" if v else None


def _device(r, names):
    return {
        "id": r["id"], "status": r["status"], "admin": bool(r["is_admin"]),
        "person": {"id": r["person_id"], "name": names.get(r["person_id"])} if r["person_id"] else None,
        "label": access.device_label(r["ua"]), "ua": r["ua"], "ip": r["ip"], "city": r["city"],
        "location": {"lat": float(r["lat"]), "lon": float(r["lon"]), "acc": r["acc"]} if r["lat"] is not None else None,
        "activity": db.unjs(r["activity"], []) or [],
        "created": _iso(r["created_at"]), "last_seen": _iso(r["last_seen"]), "decided": _iso(r["decided_at"]),
        "linked_from": r["linked_from"],
    }


@router.get("/overview")
def overview(request: Request):
    ctx = load_ctx(request)
    access.need_admin(ctx)
    names = {r["id"]: r["name"] for r in db.rows("SELECT id, name FROM people")}
    devices = db.rows("SELECT * FROM devices ORDER BY last_seen DESC")
    requests_ = [_device(r, names) for r in devices if r["status"] == "pending" and r["person_id"]]
    others = [_device(r, names) for r in devices if not (r["status"] == "pending" and r["person_id"])]
    people = []
    for p in db.rows("SELECT id, name, created_at FROM people WHERE deleted_at IS NULL ORDER BY name"):
        srcs = db.rows("SELECT label, last_ok, last_error, last_sync FROM sources WHERE person_id=%s AND deleted_at IS NULL", (p["id"],))
        people.append({
            "id": p["id"], "name": p["name"],
            "devices": sum(1 for d in devices if d["person_id"] == p["id"] and d["status"] == "approved"),
            "groups": [r["group_id"] for r in db.rows("SELECT group_id FROM group_members WHERE person_id=%s", (p["id"],))],
            "sources": [{"label": s["label"], "last_ok": _iso(s["last_ok"]), "error": s["last_error"],
                         "waiting": s["last_sync"] is None} for s in srcs],
        })
    groups = db.rows("SELECT id, name, kind FROM user_groups WHERE deleted_at IS NULL ORDER BY kind, name")
    actions = [{"id": a["id"], "summary": a["summary"], "created": _iso(a["created_at"]), "undone": a["undone_at"] is not None}
               for a in db.rows("SELECT * FROM actions ORDER BY id DESC LIMIT 40")]
    return {
        "gate": access.gate_on(), "requests": requests_, "devices": others, "people": people,
        "groups": groups, "actions": actions, "cert": certstatus.read(with_prompt=True),
    }


class GateIn(BaseModel):
    on: bool


@router.post("/gate")
def set_gate(body: GateIn, request: Request):
    ctx = load_ctx(request)
    access.need_admin(ctx)
    before = "on" if access.gate_on() else "off"
    db.set_setting("gate", "on" if body.on else "off")
    label = "Goedkeuring verplicht AAN" if body.on else "Goedkeuring verplicht UIT"
    return {"ok": True, "undo": access.record(ctx, "gate", label, {"before": before}, admin_only=True)}


class DeviceAction(BaseModel):
    action: str = Field(pattern="^(approve|deny|block|admin|unadmin|person)$")
    person_id: int | None = None


def _sync_later(person_id):
    def run():
        try:
            sync.sync_person(person_id)
        except Exception:
            pass
    threading.Thread(target=run, daemon=True).start()


@router.post("/devices/{device_id}")
def device_action(device_id: int, body: DeviceAction, request: Request):
    ctx = load_ctx(request)
    access.need_admin(ctx)
    d = db.one("SELECT * FROM devices WHERE id=%s", (device_id,))
    if not d:
        raise HTTPException(404, {"code": "gone", "message": "Toestel niet gevonden."})
    if d["id"] == ctx.device["id"] and body.action in ("deny", "block", "unadmin"):
        raise HTTPException(400, {"code": "self", "message": "Dat kan je niet met je eigen toestel."})
    before = {"status": d["status"], "is_admin": d["is_admin"], "person_id": d["person_id"]}
    name = db.one("SELECT name FROM people WHERE id=%s", (d["person_id"],))["name"] if d["person_id"] else "zonder naam"
    who = f"{name} ({access.device_label(d['ua'])})"
    if body.action in ("approve", "deny", "block"):
        status = {"approve": "approved", "deny": "denied", "block": "blocked"}[body.action]
        # Locatie is enkel voor de beslissing nodig: daarna weg
        db.run("UPDATE devices SET status=%s, decided_at=UTC_TIMESTAMP(), lat=NULL, lon=NULL, acc=NULL WHERE id=%s", (status, device_id))
        summary = {"approve": f"{who} toegelaten", "deny": f"{who} geweigerd", "block": f"{who} geblokkeerd"}[body.action]
        if body.action == "approve":
            notify.push_device(device_id, "Je hebt toegang!", "Reda heeft je toegelaten tot Roosters.", "/#/home")
            if d["person_id"]:
                _sync_later(d["person_id"])
    elif body.action in ("admin", "unadmin"):
        db.run("UPDATE devices SET is_admin=%s WHERE id=%s", (1 if body.action == "admin" else 0, device_id))
        summary = f"{who} {'is nu admin' if body.action == 'admin' else 'is geen admin meer'}"
    else:
        p = db.one("SELECT id, name FROM people WHERE id=%s AND deleted_at IS NULL", (body.person_id,))
        if not p:
            raise HTTPException(404, {"code": "noperson", "message": "Die persoon bestaat niet."})
        db.run("UPDATE devices SET person_id=%s WHERE id=%s", (p["id"], device_id))
        summary = f"{access.device_label(d['ua'])} hoort nu bij {p['name']}"
    undo = access.record(ctx, "device_status", summary, {"device_id": device_id, "before": before}, admin_only=True)
    return {"ok": True, "undo": undo}


@router.delete("/devices/{device_id}")
def device_delete(device_id: int, request: Request):
    ctx = load_ctx(request)
    access.need_admin(ctx)
    d = db.one("SELECT * FROM devices WHERE id=%s", (device_id,))
    if not d or d["id"] == ctx.device["id"]:
        raise HTTPException(400, {"code": "self", "message": "Dat kan niet."})
    undo = access.record(ctx, "device_delete", f"{access.device_label(d['ua'])} verwijderd",
                         {"row": {k: v for k, v in d.items() if k != "activity"}}, admin_only=True)
    db.run("DELETE FROM push_subs WHERE device_id=%s", (device_id,))
    db.run("DELETE FROM devices WHERE id=%s", (device_id,))
    return {"ok": True, "undo": undo}


# ---- Groepen -----------------------------------------------------------------

class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: str = Field(pattern="^(campus|home|friends)$")


@router.post("/groups")
def create_group(body: GroupIn, request: Request):
    ctx = load_ctx(request)
    access.need_admin(ctx)
    gid = db.run("INSERT INTO user_groups (name, kind) VALUES (%s,%s)", (body.name.strip(), body.kind))
    return {"ok": True, "id": gid}


class RenameIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


@router.patch("/groups/{gid}")
def rename_group(gid: int, body: RenameIn, request: Request):
    ctx = load_ctx(request)
    access.need_admin(ctx)
    db.run("UPDATE user_groups SET name=%s WHERE id=%s", (body.name.strip(), gid))
    return {"ok": True}


@router.delete("/groups/{gid}")
def delete_group(gid: int, request: Request):
    ctx = load_ctx(request)
    access.need_admin(ctx)
    g = db.one("SELECT name FROM user_groups WHERE id=%s", (gid,))
    if not g:
        raise HTTPException(404)
    db.run("UPDATE user_groups SET deleted_at=UTC_TIMESTAMP() WHERE id=%s", (gid,))
    return {"ok": True, "undo": access.record(ctx, "group_delete", f"Groep '{g['name']}' verwijderd", {"id": gid}, admin_only=True)}


class MemberIn(BaseModel):
    person_id: int
    member: bool


@router.post("/groups/{gid}/members")
def set_member(gid: int, body: MemberIn, request: Request):
    ctx = load_ctx(request)
    access.need_admin(ctx)
    was = bool(db.one("SELECT 1 AS x FROM group_members WHERE group_id=%s AND person_id=%s", (gid, body.person_id)))
    if body.member:
        db.run("INSERT IGNORE INTO group_members (group_id, person_id) VALUES (%s,%s)", (gid, body.person_id))
    else:
        db.run("DELETE FROM group_members WHERE group_id=%s AND person_id=%s", (gid, body.person_id))
    return {"ok": True, "undo": access.record(ctx, "group_member", "Groepslid gewijzigd",
                                              {"group_id": gid, "person_id": body.person_id, "was_member": was}, admin_only=True)}


# ---- Mensen ------------------------------------------------------------------

@router.patch("/people/{pid}")
def rename_person(pid: int, body: RenameIn, request: Request):
    ctx = load_ctx(request)
    access.need_admin(ctx)
    clash = db.one("SELECT id FROM people WHERE LOWER(name)=LOWER(%s) AND id<>%s AND deleted_at IS NULL", (body.name.strip(), pid))
    if clash:
        raise HTTPException(400, {"code": "name", "message": "Die naam bestaat al."})
    db.run("UPDATE people SET name=%s WHERE id=%s", (body.name.strip()[:60], pid))
    return {"ok": True}


@router.delete("/people/{pid}")
def delete_person(pid: int, request: Request):
    ctx = load_ctx(request)
    access.need_admin(ctx)
    p = db.one("SELECT name FROM people WHERE id=%s", (pid,))
    if not p:
        raise HTTPException(404)
    db.run("UPDATE people SET deleted_at=UTC_TIMESTAMP() WHERE id=%s", (pid,))
    return {"ok": True, "undo": access.record(ctx, "person_delete", f"{p['name']} verwijderd", {"id": pid}, admin_only=True)}


# ---- Alles in één keer opslaan (Beheer: 'Opslaan') ------------------------------
# De pagina houdt wijzigingen bij en stuurt ze samen; alles of niets, en één keer ongedaan te maken.

class BatchOp(BaseModel):
    op: str = Field(pattern="^(group_create|group_rename|group_delete|member|person_rename|person_delete)$")
    tmp: str | None = Field(default=None, max_length=20)        # tijdelijke id van een nieuwe groep
    group_id: int | None = None
    group_tmp: str | None = Field(default=None, max_length=20)  # lid van een groep die in deze batch gemaakt wordt
    person_id: int | None = None
    name: str | None = Field(default=None, max_length=80)
    kind: str | None = Field(default=None, pattern="^(campus|home|friends)$")
    member: bool | None = None


class BatchIn(BaseModel):
    ops: list[BatchOp] = Field(min_length=1, max_length=500)


# Eerst nieuwe groepen (dan bestaan hun id's), verwijderen als laatste
_ORDER = {"group_create": 0, "group_rename": 1, "person_rename": 1, "member": 2, "group_delete": 3, "person_delete": 3}


def _bad(msg):
    return HTTPException(400, {"code": "batch", "message": msg})


def apply_batch(ops, c):
    """-> (reverse: ops om ongedaan te maken, created: {tmp: id}, tellingen per soort)"""
    reverse, created, counts = [], {}, {}
    for o in sorted(ops, key=lambda o: _ORDER[o.op]):
        if o.op == "group_create":
            name = (o.name or "").strip()
            if not name or not o.kind or not o.tmp:
                raise _bad("Een nieuwe groep heeft een naam en een soort nodig.")
            gid = db.run("INSERT INTO user_groups (name, kind) VALUES (%s,%s)", (name, o.kind), c)
            created[o.tmp] = gid
            reverse.append({"t": "group_soft_delete", "id": gid})
        elif o.op in ("group_rename", "group_delete"):
            g = db.one("SELECT id, name FROM user_groups WHERE id=%s AND deleted_at IS NULL", (o.group_id,), c)
            if not g:
                raise _bad("Een van de groepen bestaat niet meer. Vernieuw de pagina.")
            if o.op == "group_rename":
                name = (o.name or "").strip()
                if not name:
                    raise _bad("Een groep heeft een naam nodig.")
                db.run("UPDATE user_groups SET name=%s WHERE id=%s", (name, g["id"]), c)
                reverse.append({"t": "group_name", "id": g["id"], "name": g["name"]})
            else:
                db.run("UPDATE user_groups SET deleted_at=UTC_TIMESTAMP() WHERE id=%s", (g["id"],), c)
                reverse.append({"t": "group_restore", "id": g["id"]})
        elif o.op == "member":
            gid = created.get(o.group_tmp) if o.group_tmp else o.group_id
            if not gid or o.member is None or not db.one("SELECT 1 AS x FROM user_groups WHERE id=%s AND deleted_at IS NULL", (gid,), c):
                raise _bad("Een van de groepen bestaat niet meer. Vernieuw de pagina.")
            if not db.one("SELECT 1 AS x FROM people WHERE id=%s AND deleted_at IS NULL", (o.person_id,), c):
                raise _bad("Een van de mensen bestaat niet meer. Vernieuw de pagina.")
            was = bool(db.one("SELECT 1 AS x FROM group_members WHERE group_id=%s AND person_id=%s", (gid, o.person_id), c))
            if was == o.member:
                continue
            if o.member:
                db.run("INSERT IGNORE INTO group_members (group_id, person_id) VALUES (%s,%s)", (gid, o.person_id), c)
            else:
                db.run("DELETE FROM group_members WHERE group_id=%s AND person_id=%s", (gid, o.person_id), c)
            reverse.append({"t": "member", "group_id": gid, "person_id": o.person_id, "member": was})
        else:
            p = db.one("SELECT id, name FROM people WHERE id=%s AND deleted_at IS NULL", (o.person_id,), c)
            if not p:
                raise _bad("Een van de mensen bestaat niet meer. Vernieuw de pagina.")
            if o.op == "person_rename":
                name = (o.name or "").strip()[:60]
                if not name:
                    raise _bad("Iemand heeft een naam nodig.")
                if db.one("SELECT id FROM people WHERE LOWER(name)=LOWER(%s) AND id<>%s AND deleted_at IS NULL", (name, p["id"]), c):
                    raise _bad(f"De naam '{name}' bestaat al.")
                db.run("UPDATE people SET name=%s WHERE id=%s", (name, p["id"]), c)
                reverse.append({"t": "person_name", "id": p["id"], "name": p["name"]})
            else:
                db.run("UPDATE people SET deleted_at=UTC_TIMESTAMP() WHERE id=%s", (p["id"],), c)
                reverse.append({"t": "person_restore", "id": p["id"]})
        counts[o.op] = counts.get(o.op, 0) + 1
    return reverse, created, counts


_COUNT_LABEL = {
    "group_create": ("nieuwe groep", "nieuwe groepen"), "group_rename": ("groep hernoemd", "groepen hernoemd"),
    "group_delete": ("groep verwijderd", "groepen verwijderd"), "member": ("groepslid", "groepsleden"),
    "person_rename": ("naam gewijzigd", "namen gewijzigd"), "person_delete": ("persoon verwijderd", "mensen verwijderd"),
}


@router.post("/batch")
def batch(body: BatchIn, request: Request):
    ctx = load_ctx(request)
    access.need_admin(ctx)
    with db.tx() as c:
        reverse, created, counts = apply_batch(body.ops, c)
    if not reverse:
        return {"ok": True, "created": created, "undo": None, "changes": 0}
    n = len(reverse)
    parts = [f"{k} {_COUNT_LABEL[op][0 if k == 1 else 1]}" for op, k in counts.items()]
    summary = f"Beheer: {n} {'wijziging' if n == 1 else 'wijzigingen'} ({', '.join(parts)})"
    undo = access.record(ctx, "batch", summary, {"reverse": reverse}, admin_only=True)
    return {"ok": True, "created": created, "undo": undo, "changes": n}


# ---- Backup, certificaat, ongedaan maken -------------------------------------

@router.get("/backup")
def get_backup(request: Request):
    ctx = load_ctx(request)
    access.need_admin(ctx)
    data = backup.make_zip()
    name = f"roosters-backup-{dt.datetime.now().strftime('%Y%m%d-%H%M')}.zip"
    return RawResponse(data, media_type="application/zip",
                       headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})


@router.post("/push-test")
def push_test(request: Request):
    """Over een minuut krijgt elk toestel met meldingen een testmelding (de worker verstuurt ze)."""
    ctx = load_ctx(request)
    access.need_admin(ctx)
    access.rate_limit("pushtest-all", 3, 600)
    at = db.utcnow() + dt.timedelta(minutes=1)
    db.set_setting("push_test_at", at.strftime("%Y-%m-%d %H:%M:%S"))
    n = db.one("SELECT COUNT(*) AS n FROM push_subs s JOIN devices d ON d.id=s.device_id WHERE d.status='approved'")["n"]
    return {"ok": True, "devices": n, "at": at.isoformat() + "Z"}


@router.get("/cert")
def cert(request: Request):
    ctx = load_ctx(request)
    access.need_admin(ctx)
    return certstatus.read(with_prompt=True)
