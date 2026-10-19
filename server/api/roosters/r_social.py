"""Homepagina, check-in, afspreken, samen reizen, groepen en pushmeldingen."""
import datetime as dt
import urllib.parse

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from . import access, db, logic, notify
from .access import load_ctx
from .daydata import load as load_day, now_local, now_min, relevant
from .r_access import visible_people

router = APIRouter(prefix="/api")

PUSH_HOSTS = ("fcm.googleapis.com", "updates.push.services.mozilla.com", "push.apple.com",
              "notify.windows.com", "push.services.mozilla.com")


def today():
    return now_local().date()


def _closeness(me, other) -> int:
    """0 = vriendengroep, 1 = zelfde campus, 2 = rest."""
    if me is None:
        return 2
    if me.friends & other.friends:
        return 0
    if me.campus & other.campus:
        return 1
    return 2


def _travel_for(me_id, day, people, infos):
    prefs = {(r["person_id"], r["other_id"]): r["pref"] for r in db.rows("SELECT * FROM travel_prefs")}
    out = []
    for t in logic.travel_pairs(people, infos, prefs):
        if me_id not in (t["a"], t["b"]):
            continue
        other = t["b"] if t["a"] == me_id else t["a"]
        mine = t["time_a"] if t["a"] == me_id else t["time_b"]
        theirs = t["time_b"] if t["a"] == me_id else t["time_a"]
        out.append({"other": {"id": other, "name": people[other].name}, "kind": t["kind"], "day": day.isoformat(),
                    "time": mine, "their_time": theirs, "pref": prefs.get((me_id, other))})
    return out


def _plans(days, me_person):
    rows = db.rows(
        "SELECT pl.*, p.name AS creator_name FROM plans pl JOIN people p ON p.id=pl.creator_id "
        f"WHERE pl.cancelled_at IS NULL AND pl.day IN ({','.join(['%s'] * len(days))}) ORDER BY pl.day, pl.start_min", tuple(days))
    out = []
    for r in rows:
        members = db.rows("SELECT pm.person_id, pm.response, p.name FROM plan_members pm JOIN people p ON p.id=pm.person_id WHERE pm.plan_id=%s", (r["id"],))
        out.append({
            "id": r["id"], "day": r["day"].isoformat(), "start": r["start_min"], "place": r["place"], "note": r["note"],
            "creator": {"id": r["creator_id"], "name": r["creator_name"]},
            "coming": [{"id": m["person_id"], "name": m["name"]} for m in members if m["response"] == "coming"],
            "mine": me_person is not None and r["creator_id"] == me_person,
            "my_response": next((m["response"] for m in members if m["person_id"] == me_person), None),
        })
    return out


@router.get("/home")
def home(request: Request):
    ctx = load_ctx(request)
    access.need_read(ctx, "probeerde de homepagina te openen")
    t = today()
    now = now_min()
    people, infos, campus_names = load_day(t)
    me = people.get(ctx.person_id) if ctx.person_id else None
    pname = lambda pid: {"id": pid, "name": people[pid].name}  # noqa: E731

    # Samen pauze per campus (nog lopend of nog te komen)
    windows = [w for w in logic.campus_windows(people, infos, campus_names) if w["end"] > now]
    together = []
    for w in windows:
        extra = []
        for pid, p in people.items():
            if pid in w["people"] or not infos[pid].present:
                continue
            need = logic.SAME_CAMPUS_MIN if w["campus"] in p.campus else logic.OTHER_CAMPUS_MIN
            if any(e - s >= need for s, e in logic.overlaps(infos[pid].free, [(w["start"], w["end"])])):
                extra.append(pid)
        close = min((_closeness(me, people[x]) for x in w["people"] if not me or x != me.id), default=2)
        together.append({
            "campus": w["name"], "start": w["start"], "end": w["end"],
            "people": [pname(x) for x in w["people"]], "extra": [pname(x) for x in extra],
            "mine": bool(me and me.id in w["people"]), "now": w["start"] <= now < w["end"],
            "close": close,
        })
    together.sort(key=lambda w: (not w["mine"], w["close"], w["start"]))
    n_people = len({p["id"] for w in together for p in w["people"]})

    # Mijn pauzes (ook met andere campussen)
    my_breaks = []
    if me:
        groups = {}
        for x in logic.partners(me, people, infos, after=now):
            groups.setdefault((x["start"], x["end"], x["same_campus"]), []).append(x["id"])
        for (s, e, same), ids in sorted(groups.items()):
            my_breaks.append({"start": s, "end": e, "same_campus": same, "people": [pname(i) for i in ids],
                              "now": s <= now < e})

    # Nu-bord
    board = []
    for pid, p in people.items():
        if me and pid == me.id:
            continue
        st = logic.now_status(p, infos[pid], now)
        if st["code"] == "geen":
            continue
        board.append({**pname(pid), **st, "close": _closeness(me, p),
                      "with": p.checkin.get("with_text") if p.checkin else None})
    board.sort(key=lambda b: (b["close"], b["rank"], b["name"].lower()))

    # Meldingen van vandaag (alles wat als push kwam, en meer)
    feed = []
    targets = ([ctx.person_id] if ctx.person_id else []) + ([notify.ADMIN] if ctx.admin else [])
    if targets:
        rows = db.rows(
            f"SELECT * FROM notifications WHERE person_id IN ({','.join(['%s'] * len(targets))}) "
            "AND (day=%s OR created_at > UTC_TIMESTAMP() - INTERVAL 18 HOUR) ORDER BY created_at DESC, id DESC LIMIT 40",
            (*targets, t))
        feed = [{"id": r["id"], "kind": r["kind"], "title": r["title"], "body": r["body"],
                 "payload": db.unjs(r["payload"], {}), "created": r["created_at"].isoformat() + "Z"} for r in rows]

    # Samen naar school/huis: vandaag (als je dag nog moet beginnen) en morgen
    travel = []
    if me:
        if infos[me.id].busy and now < infos[me.id].busy[-1][1]:
            travel += [x for x in _travel_for(me.id, t, people, infos)
                       if (x["kind"] == "heen" and now < x["time"]) or x["kind"] == "terug"]
        tm = t + dt.timedelta(days=1)
        p2, i2, _ = load_day(tm)
        for p in p2.values():
            p.checkin = None
        i2 = {pid: logic.day_info(p) for pid, p in p2.items()}
        travel += _travel_for(me.id, tm, p2, i2)

    checkin = None
    if me:
        r = db.one("SELECT * FROM checkins WHERE person_id=%s AND day=%s", (me.id, t))
        if r:
            checkin = {"status": r["status"], "until_min": r["until_min"], "with_ids": db.unjs(r["with_ids"], []),
                       "with_text": r["with_text"]}

    admin = None
    if ctx.admin:
        admin = {"pending": db.one("SELECT COUNT(*) AS n FROM devices WHERE status='pending' AND person_id IS NOT NULL")["n"]}

    return {
        "me": pname(me.id) if me else None,
        "has_school_today": bool(me and infos[me.id].busy),
        "checkin": checkin,
        "summary": n_people,
        "together": together,
        "my_breaks": my_breaks,
        "board": board,
        "feed": feed,
        "travel": travel,
        "plans": _plans([t, t + dt.timedelta(days=1)], ctx.person_id),
        "admin": admin,
        "now_min": now,
        "today": t.isoformat(),
    }


# ---- Check-in ------------------------------------------------------------------

class CheckinIn(BaseModel):
    status: str = Field(pattern="^(chilling|want_chill|home|absent|skip|clear)$")
    until_min: int | None = Field(default=None, ge=0, le=24 * 60)
    with_ids: list[int] = Field(default_factory=list, max_length=20)
    with_text: str | None = Field(default=None, max_length=120)


@router.post("/checkin")
def checkin(body: CheckinIn, request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    t = today()
    now = now_min()
    before = db.one("SELECT status, since_min, until_min, with_ids, with_text FROM checkins WHERE person_id=%s AND day=%s", (ctx.person_id, t))
    if before:
        before["with_ids"] = db.unjs(before["with_ids"], [])
    if body.status == "clear":
        db.run("DELETE FROM checkins WHERE person_id=%s AND day=%s", (ctx.person_id, t))
    else:
        with_ids = [i for i in body.with_ids if i != ctx.person_id]
        db.run(
            "INSERT INTO checkins (person_id, day, status, since_min, until_min, with_ids, with_text) VALUES (%s,%s,%s,%s,%s,%s,%s) "
            "ON DUPLICATE KEY UPDATE status=VALUES(status), since_min=VALUES(since_min), until_min=VALUES(until_min), "
            "with_ids=VALUES(with_ids), with_text=VALUES(with_text), updated_at=UTC_TIMESTAMP()",
            (ctx.person_id, t, body.status, now, body.until_min, db.js(with_ids), (body.with_text or "").strip() or None))
    labels = {"chilling": "Al aant chillen", "want_chill": "Ik wil chillen", "home": "Ik ga naar huis",
              "absent": "Ik ben er vandaag niet", "skip": "Check-in overgeslagen", "clear": "Check-in gewist"}
    undo = access.record(ctx, "checkin", labels[body.status], {"person_id": ctx.person_id, "day": t.isoformat(), "before": before})
    if body.status in ("chilling", "want_chill"):
        _announce_stay(ctx.person_id, body, t)
    return {"ok": True, "undo": undo}


def _announce_stay(pid, body, t):
    people, infos, _ = load_day(t)
    me = people.get(pid)
    if not me:
        return
    who = [people[i].name for i in body.with_ids if i in people]
    if body.with_text:
        who.append(body.with_text.strip())
    until = f" tot {logic.fmt(body.until_min)}" if body.until_min else ""
    if body.status == "chilling":
        text = f"{me.name} is aan het chillen" + (f" met {logic.names(who)}" if who else "") + until + "."
    else:
        text = f"{me.name} blijft in Antwerpen en wil chillen{until}."
    scopes = notify.all_scopes()
    for oid, other in people.items():
        if oid == pid or not relevant(other, me, scopes.get(oid, notify.DEFAULT_SCOPE)):
            continue
        notify.enqueue(oid, "blijven", f"blijven:{t}:{pid}:{body.status}:{body.until_min}", "Wie blijft er?", text,
                       {"open": "afspreken", "people": [pid, oid]}, t)


# ---- Afspreken ---------------------------------------------------------------

@router.get("/afspreken")
def afspreken(request: Request):
    ctx = load_ctx(request)
    access.need_read(ctx, "probeerde Afspreken te openen")
    t = today()
    rows = db.rows("SELECT c.*, p.name FROM checkins c JOIN people p ON p.id=c.person_id AND p.deleted_at IS NULL "
                   "WHERE c.day=%s AND c.status<>'skip' ORDER BY c.updated_at DESC", (t,))
    names = {r["id"]: r["name"] for r in db.rows("SELECT id, name FROM people WHERE deleted_at IS NULL")}
    checkins = [{"person": {"id": r["person_id"], "name": r["name"]}, "status": r["status"], "until_min": r["until_min"],
                 "with": [names[i] for i in db.unjs(r["with_ids"], []) if i in names] + ([r["with_text"]] if r["with_text"] else []),
                 "mine": r["person_id"] == ctx.person_id} for r in rows]
    prefs = []
    if ctx.person_id:
        prefs = [{"other": {"id": r["other_id"], "name": names.get(r["other_id"], "?")}, "pref": r["pref"]}
                 for r in db.rows("SELECT * FROM travel_prefs WHERE person_id=%s", (ctx.person_id,)) if r["other_id"] in names]
    mine = next((c for c in checkins if c["mine"]), None)
    return {"checkins": checkins, "mine": mine, "plans": _plans([t, t + dt.timedelta(days=1)], ctx.person_id),
            "travel_prefs": prefs, "now_min": now_min(), "today": t.isoformat()}


class PlanIn(BaseModel):
    tomorrow: bool = False
    start_min: int = Field(ge=0, le=24 * 60 - 1)
    place: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=200)


@router.post("/plans")
def create_plan(body: PlanIn, request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    access.rate_limit(f"plan:{ctx.person_id}", 20, 3600)
    day = today() + dt.timedelta(days=1 if body.tomorrow else 0)
    pid = db.run("INSERT INTO plans (creator_id, day, start_min, place, note) VALUES (%s,%s,%s,%s,%s)",
                 (ctx.person_id, day, body.start_min, body.place.strip(), (body.note or "").strip() or None))
    db.run("INSERT INTO plan_members (plan_id, person_id, response) VALUES (%s,%s,'coming')", (pid, ctx.person_id))
    people, infos, _ = load_day(day)
    me = people.get(ctx.person_id)
    scopes = notify.all_scopes()
    when = "morgen " if body.tomorrow else ""
    text = f"{me.name} gaat {when}om {logic.fmt(body.start_min)} naar {body.place.strip()}. Kom je mee?"
    if body.note:
        text += f" ({body.note.strip()})"
    for oid, other in people.items():
        if oid == me.id or not relevant(other, me, scopes.get(oid, notify.DEFAULT_SCOPE)):
            continue
        if not body.tomorrow and not infos[oid].present:
            continue
        notify.enqueue(oid, "afspraak", f"plan:{pid}", "Afspreken", text, {"open": "afspreken", "plan": pid}, day)
    return {"ok": True, "id": pid}


class RespondIn(BaseModel):
    response: str = Field(pattern="^(coming|not|none)$")


@router.post("/plans/{plan_id}/respond")
def respond_plan(plan_id: int, body: RespondIn, request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    pl = db.one("SELECT * FROM plans WHERE id=%s AND cancelled_at IS NULL", (plan_id,))
    if not pl:
        raise HTTPException(404, {"code": "gone", "message": "Deze afspraak bestaat niet meer."})
    if body.response == "none":
        db.run("DELETE FROM plan_members WHERE plan_id=%s AND person_id=%s", (plan_id, ctx.person_id))
    else:
        db.run("INSERT INTO plan_members (plan_id, person_id, response) VALUES (%s,%s,%s) ON DUPLICATE KEY UPDATE response=VALUES(response)",
               (plan_id, ctx.person_id, body.response))
    if body.response == "coming" and pl["creator_id"] != ctx.person_id:
        name = db.one("SELECT name FROM people WHERE id=%s", (ctx.person_id,))["name"]
        notify.enqueue(pl["creator_id"], "afspraak", f"plan:{plan_id}:komt:{ctx.person_id}", "Afspreken",
                       f"{name} komt ook naar {pl['place']} om {logic.fmt(pl['start_min'])}.",
                       {"open": "afspreken", "plan": plan_id}, pl["day"])
    return {"ok": True}


@router.delete("/plans/{plan_id}")
def cancel_plan(plan_id: int, request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    pl = db.one("SELECT * FROM plans WHERE id=%s AND cancelled_at IS NULL", (plan_id,))
    if not pl or (pl["creator_id"] != ctx.person_id and not ctx.admin):
        raise HTTPException(404, {"code": "gone", "message": "Deze afspraak bestaat niet meer."})
    db.run("UPDATE plans SET cancelled_at=UTC_TIMESTAMP() WHERE id=%s", (plan_id,))
    return {"ok": True, "undo": access.record(ctx, "plan_cancel", f"Afspraak '{pl['place']}' geannuleerd", {"id": plan_id})}


class TravelPrefIn(BaseModel):
    other_id: int
    pref: str = Field(pattern="^(never|always|none)$")


@router.post("/travel-pref")
def travel_pref(body: TravelPrefIn, request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    if body.other_id == ctx.person_id:
        raise HTTPException(400, {"code": "self", "message": "Dat ben je zelf."})
    before = db.one("SELECT pref FROM travel_prefs WHERE person_id=%s AND other_id=%s", (ctx.person_id, body.other_id))
    db.run("DELETE FROM travel_prefs WHERE person_id=%s AND other_id=%s", (ctx.person_id, body.other_id))
    if body.pref != "none":
        db.run("INSERT INTO travel_prefs (person_id, other_id, pref) VALUES (%s,%s,%s)", (ctx.person_id, body.other_id, body.pref))
    other = db.one("SELECT name FROM people WHERE id=%s", (body.other_id,))
    label = {"never": f"Geen reisvoorstellen meer met {other['name'] if other else '?'}",
             "always": f"{other['name'] if other else '?'} toegevoegd als reismaatje",
             "none": "Reisvoorkeur gewist"}[body.pref]
    return {"ok": True, "undo": access.record(ctx, "travel_pref", label, {
        "person_id": ctx.person_id, "other_id": body.other_id, "before": before["pref"] if before else None})}


# ---- Groepen -----------------------------------------------------------------

@router.get("/groups")
def groups(request: Request):
    ctx = load_ctx(request)
    access.need_read(ctx, "probeerde de groepen te bekijken")
    gs = db.rows("SELECT id, name, kind FROM user_groups WHERE deleted_at IS NULL ORDER BY kind, name")
    members = {}
    for r in db.rows("SELECT gm.group_id, gm.person_id FROM group_members gm JOIN people p ON p.id=gm.person_id AND p.deleted_at IS NULL"):
        members.setdefault(r["group_id"], []).append(r["person_id"])
    people = visible_people(ctx.person_id)
    shown = {p["id"] for p in people}
    return {"groups": [{**g, "members": [m for m in members.get(g["id"], []) if m in shown]} for g in gs],
            "people": people, "me": ctx.person_id}


@router.post("/groups/{gid}/{action}")
def join_leave(gid: int, action: str, request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    if action not in ("join", "leave"):
        raise HTTPException(404)
    g = db.one("SELECT * FROM user_groups WHERE id=%s AND deleted_at IS NULL", (gid,))
    if not g:
        raise HTTPException(404, {"code": "gone", "message": "Die groep bestaat niet meer."})
    was = bool(db.one("SELECT 1 AS x FROM group_members WHERE group_id=%s AND person_id=%s", (gid, ctx.person_id)))
    if action == "join":
        db.run("INSERT IGNORE INTO group_members (group_id, person_id) VALUES (%s,%s)", (gid, ctx.person_id))
    else:
        db.run("DELETE FROM group_members WHERE group_id=%s AND person_id=%s", (gid, ctx.person_id))
    label = f"{'Bij' if action == 'join' else 'Uit'} '{g['name']}'"
    return {"ok": True, "undo": access.record(ctx, "group_member", label,
                                              {"group_id": gid, "person_id": ctx.person_id, "was_member": was})}


# ---- Pushmeldingen -----------------------------------------------------------

class SubIn(BaseModel):
    endpoint: str = Field(max_length=600)
    keys: dict


@router.post("/push/subscribe")
def push_subscribe(body: SubIn, request: Request):
    ctx = load_ctx(request)
    if not ctx.device or ctx.device["status"] in ("denied", "blocked"):
        raise HTTPException(403, {"code": "nodevice", "message": "Kies eerst wie je bent."})
    parts = urllib.parse.urlsplit(body.endpoint)
    host = parts.hostname or ""
    if parts.scheme != "https" or not any(host == h or host.endswith("." + h) for h in PUSH_HOSTS):
        raise HTTPException(400, {"code": "endpoint", "message": "Onbekende pushdienst."})
    p256dh, auth = str(body.keys.get("p256dh", ""))[:200], str(body.keys.get("auth", ""))[:100]
    if not p256dh or not auth:
        raise HTTPException(400, {"code": "keys", "message": "Ongeldig abonnement."})
    db.run("INSERT INTO push_subs (device_id, endpoint, p256dh, auth) VALUES (%s,%s,%s,%s) "
           "ON DUPLICATE KEY UPDATE device_id=VALUES(device_id), p256dh=VALUES(p256dh), auth=VALUES(auth), failures=0",
           (ctx.device["id"], body.endpoint, p256dh, auth))
    return {"ok": True}


class UnsubIn(BaseModel):
    endpoint: str = Field(max_length=600)


@router.post("/push/unsubscribe")
def push_unsubscribe(body: UnsubIn, request: Request):
    ctx = load_ctx(request)
    if ctx.device:
        db.run("DELETE FROM push_subs WHERE endpoint=%s AND device_id=%s", (body.endpoint, ctx.device["id"]))
    return {"ok": True}


@router.post("/push/test")
def push_test(request: Request):
    ctx = load_ctx(request)
    if not ctx.device:
        raise HTTPException(403, {"code": "nodevice", "message": "Kies eerst wie je bent."})
    access.rate_limit(f"pushtest:{ctx.device['id']}", 5, 600)
    n = notify.push_device(ctx.device["id"], "Roosters", "Meldingen werken!", "/#/opties")
    return {"ok": n > 0, "sent": n}


@router.get("/notify-prefs")
def get_prefs(request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    p = notify.prefs(ctx.person_id)
    return {"kinds": [{"kind": k, "label": v, "on": p[k]} for k, v in notify.KINDS.items()],
            "scope": p["scope"], "scopes": [{"value": k, "label": v} for k, v in notify.SCOPES.items()]}


class PrefIn(BaseModel):
    kind: str = Field(max_length=30)
    value: str = Field(max_length=30)


@router.post("/notify-prefs")
def set_pref(body: PrefIn, request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    if body.kind == "scope":
        if body.value not in notify.SCOPES:
            raise HTTPException(400, {"code": "value", "message": "Ongeldige keuze."})
    elif body.kind not in notify.KINDS or body.value not in ("0", "1"):
        raise HTTPException(400, {"code": "value", "message": "Ongeldige keuze."})
    db.run("INSERT INTO notify_prefs (person_id, kind, value) VALUES (%s,%s,%s) ON DUPLICATE KEY UPDATE value=VALUES(value)",
           (ctx.person_id, body.kind, body.value))
    return {"ok": True}
