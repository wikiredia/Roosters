"""Pauze-verzoeken: "Reda wil pauze met jou, kan jij?" (vervangt de oude Afspraken).

Iemand tikt een pauze aan die hij/zij met anderen gemeen heeft en vraagt om ze samen door te
brengen: ik kom naar jou, jij komt naar mij, of afspreken op een plek, van/tot (standaard de hele
pauze). De anderen krijgen een melding met Ja/Nee; het antwoord gaat terug naar wie vroeg. Wie
'ja' zegt, komt als gebeurtenis in de groepschat ("Reda en Yeno gaan samen pauze pakken").

Tabellen: break_requests, break_request_members (zie schema.sql).
"""
import datetime as dt

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from . import access, db, events, logic, notify
from .access import load_ctx
from .daydata import load as load_day, now_local, now_min
from .r_social import known_ids

router = APIRouter(prefix="/api")

# Zo heet de melding met een vraag; de service worker zet er dan Ja/Nee-knoppen bij (zie sw.js)
ASK_TITLE = "Pauze samen?"
# Hoeveel dagen vooruit je pauze kan vragen (vandaag = 0)
MAX_DAYS_AHEAD = 6
MODES = ("i_come", "you_come", "meet")


# ---- Pure stukjes (getest in tests/test_breaks.py) ------------------------------

def when_word(day: dt.date, today: dt.date) -> str:
    if day == today:
        return "vandaag"
    if day == today + dt.timedelta(days=1):
        return "morgen"
    return ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"][day.weekday()]


def conflict(p: logic.PersonDay, info: logic.DayInfo, start: int, end: int, when: str = "vandaag") -> str | None:
    """Waarom kan `p` niet van start tot end? None = kan wel (geen les, niet weg).
    Vóór de eerste of na de laatste les mag ook: dan kan je nog afspreken."""
    st = (p.checkin or {}).get("status")
    if st == "absent":
        return f"{p.name} is er {when} niet"
    if not info.present:
        return f"{p.name} heeft {when} geen les"
    if info.left_at is not None and info.left_at <= start:
        return f"{p.name} is al naar huis"
    for s, e in info.busy:
        if s < end and e > start:
            return f"{p.name} heeft dan les ({logic.fmt(s)}–{logic.fmt(e)})"
    return None


def mode_text(mode: str, place: str | None, sender: str, others: list[str] | None = None) -> str:
    """'ik kom naar jou' in woorden. Zonder `others`: gezien door wie gevraagd wordt;
    met `others` (namen van wie gevraagd werd): gezien door wie vroeg."""
    if mode == "meet":
        return f"op {place}" if place else "samen ergens"
    if others is None:
        return f"{sender} komt naar jou" if mode == "i_come" else f"jij gaat naar {sender}"
    who = logic.names(others)
    if mode == "i_come":
        return f"jij gaat naar {who}"
    return f"{who} {'komt' if len(others) == 1 else 'komen'} naar jou"


def summarize(members: list[dict]) -> str:
    """Stand van een verzoek: planned (iemand zei ja), declined (iedereen nee), pending."""
    if any(m["response"] == "accepted" for m in members):
        return "planned"
    if members and all(m["response"] == "declined" for m in members):
        return "declined"
    return "pending"


def already_asked(existing: list[dict], sender: int, to_ids: list[int], start: int, end: int) -> dict | None:
    """Loopt er al een verzoek op (een stuk van) dit moment met (een van) dezelfde mensen?
    existing: [{id, from_id, start, end, members: {pid: response}}] (niet geannuleerd).
    -> {"kind": "mine"|"theirs", "state": "pending"|"accepted", "who": [ids], "item": e} of None.
    'mine' = jij vroeg het al, 'theirs' = zij vroegen het jou al. Geweigerd telt niet meer."""
    for e in existing:
        if not (e["start"] < end and e["end"] > start):
            continue
        ms = e["members"]
        if e["from_id"] == sender:
            who = [i for i in to_ids if ms.get(i) in ("pending", "accepted")]
            if who:
                state = "accepted" if any(ms[i] == "accepted" for i in who) else "pending"
                return {"kind": "mine", "state": state, "who": who, "item": e}
        elif e["from_id"] in to_ids and ms.get(sender) in ("pending", "accepted"):
            return {"kind": "theirs", "state": ms[sender], "who": [e["from_id"]], "item": e}
    return None


def dup_message(hit: dict, name_of) -> str:
    e = hit["item"]
    span = f"{logic.fmt(e['start'])}–{logic.fmt(e['end'])}"
    who = logic.names([name_of(i) for i in hit["who"]])
    if hit["state"] == "accepted":
        return f"Je hebt al pauze met {who} ({span})."
    if hit["kind"] == "mine":
        return f"Je vroeg {who} al pauze ({span}). Wacht op een antwoord of trek het eerst in."
    return f"{who} vroeg jou al pauze ({span}). Antwoord op die vraag bij Pauzes."


def flip(mode: str) -> str:
    """Tegenvoorstel: 'ik kom naar jou' van de ander is 'jij komt naar mij' van jou."""
    return {"i_come": "you_come", "you_come": "i_come"}.get(mode, mode)


# ---- Hulpjes met de database --------------------------------------------------

def _today():
    return now_local().date()


def _day(day: dt.date):
    people, infos, _ = load_day(day)
    if day != _today():
        # check-ins gelden enkel voor vandaag
        for p in people.values():
            p.checkin = None
        infos = {pid: logic.day_info(p) for pid, p in people.items()}
    return people, infos


def _parse_day(v: str | None) -> dt.date:
    t = _today()
    if not v:
        return t
    try:
        d = dt.date.fromisoformat(v)
    except ValueError:
        raise HTTPException(400, {"code": "day", "message": "Ongeldige dag."})
    if d < t or d > t + dt.timedelta(days=MAX_DAYS_AHEAD):
        raise HTTPException(400, {"code": "day", "message": "Pauze vragen kan voor vandaag en de komende dagen."})
    return d


def _check_time(day: dt.date, start: int, end: int):
    if end <= start:
        raise HTTPException(400, {"code": "time", "message": "Het einde moet na het begin komen."})
    if end - start < 5:
        raise HTTPException(400, {"code": "time", "message": "Dat is wel heel kort."})
    if day == _today() and end <= now_min():
        raise HTTPException(400, {"code": "time", "message": "Dat moment is al voorbij."})


def _span(r) -> str:
    return f"{logic.fmt(r['start_min'])}–{logic.fmt(r['end_min'])}"


def _load(rid: int):
    r = db.one("SELECT b.*, p.name AS from_name FROM break_requests b JOIN people p ON p.id=b.from_id WHERE b.id=%s", (rid,))
    if not r or r["cancelled_at"]:
        raise HTTPException(404, {"code": "gone", "message": "Dit verzoek bestaat niet meer."})
    return r


def _members(rid: int):
    return db.rows("SELECT m.person_id, m.response, p.name FROM break_request_members m JOIN people p ON p.id=m.person_id "
                   "WHERE m.request_id=%s ORDER BY p.name", (rid,))


def _name(pid: int) -> str:
    r = db.one("SELECT name FROM people WHERE id=%s", (pid,))
    return r["name"] if r else "?"


def _existing(pid: int, day: dt.date, ignore: int | None = None) -> list[dict]:
    """Verzoeken op `day` van of aan `pid` (niet geannuleerd), voor already_asked."""
    rows = db.rows(
        "SELECT DISTINCT b.id, b.from_id, b.start_min, b.end_min FROM break_requests b "
        "LEFT JOIN break_request_members m ON m.request_id=b.id "
        "WHERE b.cancelled_at IS NULL AND b.day=%s AND (b.from_id=%s OR m.person_id=%s)", (day, pid, pid))
    out = []
    for r in rows:
        if r["id"] == ignore:
            continue
        ms = {m["person_id"]: m["response"] for m in _members(r["id"])}
        out.append({"id": r["id"], "from_id": r["from_id"], "start": r["start_min"], "end": r["end_min"], "members": ms})
    return out


def _create(sender: int, to_ids: list[int], day: dt.date, start: int, end: int, mode: str, place, note,
            ignore: int | None = None) -> int:
    """Controleert iedereen en maakt het verzoek; meldt het aan wie gevraagd wordt.
    Liep er al een verzoek met dezelfde mensen op dat moment: 409 (geen dubbele vraag)."""
    _check_time(day, start, end)
    to_ids = sorted({i for i in to_ids if i != sender})
    if not to_ids:
        raise HTTPException(400, {"code": "people", "message": "Kies met wie je pauze wil nemen."})
    known = known_ids(sender)
    if any(i not in known for i in to_ids):
        raise HTTPException(400, {"code": "people", "message": "Je kan enkel pauze vragen aan mensen die je kent."})
    people, infos = _day(day)
    if sender not in people or any(i not in people for i in to_ids):
        raise HTTPException(404, {"code": "noperson", "message": "Die persoon bestaat niet (meer)."})
    when = when_word(day, _today())
    me = people[sender]
    why = conflict(me, infos[sender], start, end, when)
    if why:
        raise HTTPException(400, {"code": "busy", "message": f"Je kan dan zelf niet: {why}."})
    bad = [w for w in (conflict(people[i], infos[i], start, end, when) for i in to_ids) if w]
    if bad:
        raise HTTPException(400, {"code": "busy", "message": logic.names(bad) + "."})
    hit = already_asked(_existing(sender, day, ignore), sender, to_ids, start, end)
    if hit:
        raise HTTPException(409, {"code": "dup", "message": dup_message(hit, lambda i: people[i].name),
                                  "request": hit["item"]["id"]})
    place = (place or "").strip() or None
    if mode == "meet" and not place:
        place = None
    rid = db.run("INSERT INTO break_requests (from_id, day, start_min, end_min, mode, place, note) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                 (sender, day, start, end, mode, place, (note or "").strip() or None))
    db.many("INSERT INTO break_request_members (request_id, person_id) VALUES (%s,%s)", [(rid, i) for i in to_ids])
    for i in to_ids:
        others = [people[x].name for x in to_ids if x != i]
        how = mode_text(mode, place, me.name)
        body = f"{me.name} wil pauze met jou{' en ' + logic.names(others) if others else ''}, kan jij? " \
               f"{when.capitalize()} {logic.fmt(start)}–{logic.fmt(end)}, {how}."
        if note:
            body += f" ({note.strip()})"
        notify.enqueue(i, "pauze_verzoek", f"breq:{rid}", ASK_TITLE, body,
                       {"open": "pauzes", "request": rid, "actions": ["ja", "nee"]}, day)
    return rid


def _respond(rid: int, pid: int, response: str) -> dict:
    r = _load(rid)
    mine = db.one("SELECT response FROM break_request_members WHERE request_id=%s AND person_id=%s", (rid, pid))
    if not mine:
        raise HTTPException(404, {"code": "gone", "message": "Dit verzoek is niet voor jou."})
    if r["day"] < _today() or (r["day"] == _today() and r["end_min"] <= now_min()):
        raise HTTPException(400, {"code": "past", "message": "Deze pauze is al voorbij."})
    before = mine["response"]
    if before == response:
        return {"ok": True, "changed": False}
    db.run("UPDATE break_request_members SET response=%s, responded_at=UTC_TIMESTAMP() WHERE request_id=%s AND person_id=%s",
           (response, rid, pid))
    name = _name(pid)
    span = _span(r)
    stamp = db.utcnow().strftime("%H%M%S")
    if response == "accepted":
        text = f"{name} neemt pauze met jou ({span}, {mode_text(r['mode'], r['place'], r['from_name'], [name])})."
        notify.enqueue(r["from_id"], "pauze_verzoek", f"breq:{rid}:ja:{pid}:{stamp}", "Pauze samen: ja!", text,
                       {"open": "pauzes", "request": rid}, r["day"])
        where = f", {r['place']}" if r["mode"] == "meet" and r["place"] else ""
        events.post([r["from_id"], pid], f"{r['from_name']} en {name} gaan samen pauze pakken ({span}{where})",
                    payload={"people": [r["from_id"], pid], "start": r["start_min"], "end": r["end_min"],
                             "open": "vergelijk", "request": rid},
                    dedupe=f"breq:{rid}:{pid}", day=r["day"])
    else:
        text = (f"{name} kan toch niet meer pauze nemen met jou ({span})." if before == "accepted"
                else f"{name} kan niet pauze nemen met jou ({span}).")
        notify.enqueue(r["from_id"], "pauze_verzoek", f"breq:{rid}:nee:{pid}:{stamp}", "Pauze samen", text,
                       {"open": "pauzes", "request": rid}, r["day"])
    return {"ok": True, "changed": True}


def _item(r, members, people, infos, viewer, today, now):
    """Eén verzoek zoals de app het toont."""
    mine = r["from_id"] == viewer
    ms = [{"id": m["person_id"], "name": m["name"], "response": m["response"]} for m in members]
    state = summarize(ms)
    # Gaat het nog? Enkel wie meedoet (of nog kan antwoorden) telt
    when = when_word(r["day"], today)
    conflicts = []
    if people is not None:
        involved = [r["from_id"]] + [m["id"] for m in ms if m["response"] != "declined"]
        for pid in involved:
            if pid in people:
                why = conflict(people[pid], infos[pid], r["start_min"], r["end_min"], when)
                if why:
                    conflicts.append(why)
    return {
        "id": r["id"], "day": r["day"].isoformat(), "start": r["start_min"], "end": r["end_min"],
        "mode": r["mode"], "place": r["place"], "note": r["note"],
        "from": {"id": r["from_id"], "name": r["from_name"]}, "mine": mine,
        "members": ms, "my_response": None if mine else next((m["response"] for m in ms if m["id"] == viewer), None),
        "state": state, "conflicts": conflicts,
        "now": r["day"] == today and r["start_min"] <= now < r["end_min"],
    }


def list_for(pid: int) -> list[dict]:
    today, now = _today(), now_min()
    rows = db.rows(
        "SELECT DISTINCT b.*, p.name AS from_name FROM break_requests b JOIN people p ON p.id=b.from_id "
        "LEFT JOIN break_request_members m ON m.request_id=b.id "
        "WHERE b.cancelled_at IS NULL AND b.day >= %s AND b.day <= %s AND (b.from_id=%s OR m.person_id=%s) "
        "ORDER BY b.day, b.start_min, b.id",
        (today, today + dt.timedelta(days=MAX_DAYS_AHEAD), pid, pid))
    rows = [r for r in rows if not (r["day"] == today and r["end_min"] <= now)]
    days = {}
    out = []
    for r in rows:
        if r["day"] not in days:
            days[r["day"]] = _day(r["day"])
        people, infos = days[r["day"]]
        out.append(_item(r, _members(r["id"]), people, infos, pid, today, now))
    return out


def others_planned(viewer: int) -> list[dict]:
    """Wat anderen (die jij kent) vandaag samen gepland hebben, zonder jou: 'Kayra en Yeno, 12:30–13:30'.
    Dat staat ook als gebeurtenis in de groepschat; hier zie je het naast je eigen plannen."""
    today, now = _today(), now_min()
    known = known_ids(viewer)
    rows = db.rows("SELECT b.*, p.name AS from_name FROM break_requests b JOIN people p ON p.id=b.from_id "
                   "WHERE b.cancelled_at IS NULL AND b.day=%s AND b.end_min > %s ORDER BY b.start_min", (today, now))
    out = []
    for r in rows:
        ms = _members(r["id"])
        yes = [m for m in ms if m["response"] == "accepted"]
        ids = [r["from_id"]] + [m["person_id"] for m in yes]
        if not yes or viewer in ids or viewer in (m["person_id"] for m in ms) or not all(i in known for i in ids):
            continue
        out.append({"id": r["id"], "start": r["start_min"], "end": r["end_min"],
                    "people": [{"id": r["from_id"], "name": r["from_name"]}] + [{"id": m["person_id"], "name": m["name"]} for m in yes],
                    "place": r["place"] if r["mode"] == "meet" else None,
                    "now": r["start_min"] <= now < r["end_min"]})
    return out


def planned_with(pid: int, day: dt.date) -> list[dict]:
    """Voor de meldingen: met wie heeft `pid` op `day` al iets lopen?
    -> [{start, end, ids (de anderen), state: 'planned'|'pending'}]"""
    out = []
    for e in _existing(pid, day):
        ms = e["members"]
        if e["from_id"] == pid:
            yes = [i for i, r in ms.items() if r == "accepted"]
            open_ = [i for i, r in ms.items() if r == "pending"]
            if yes:
                out.append({"start": e["start"], "end": e["end"], "ids": yes, "state": "planned"})
            if open_:
                out.append({"start": e["start"], "end": e["end"], "ids": open_, "state": "pending"})
        elif ms.get(pid) in ("pending", "accepted"):
            others = [e["from_id"]] + [i for i, r in ms.items() if r == "accepted" and i != pid]
            out.append({"start": e["start"], "end": e["end"], "ids": others,
                        "state": "planned" if ms[pid] == "accepted" else "pending"})
    return out


# ---- API -----------------------------------------------------------------------

class BreakIn(BaseModel):
    to_ids: list[int] = Field(min_length=1, max_length=12)
    day: str | None = None
    start_min: int = Field(ge=0, le=24 * 60)
    end_min: int = Field(ge=0, le=24 * 60)
    mode: str = Field(default="meet", pattern="^(i_come|you_come|meet)$")
    place: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=200)


@router.get("/breaks")
def breaks(request: Request):
    """Geplande pauzes en verzoeken (van jou en aan jou), vandaag en de komende dagen."""
    ctx = load_ctx(request)
    access.need_person(ctx)
    items = list_for(ctx.person_id)
    # pending_for_me: vragen aan jou zonder antwoord (Home springt dan niet meteen naar je rooster)
    return {"items": items, "pending_for_me": sum(1 for x in items if x["my_response"] == "pending"),
            "others": others_planned(ctx.person_id), "today": _today().isoformat(), "now_min": now_min()}


@router.post("/breaks")
def create(body: BreakIn, request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    access.rate_limit(f"breq:{ctx.person_id}", 30, 3600)
    rid = _create(ctx.person_id, body.to_ids, _parse_day(body.day), body.start_min, body.end_min, body.mode, body.place, body.note)
    return {"ok": True, "id": rid}


class RespondIn(BaseModel):
    response: str = Field(pattern="^(accepted|declined)$")


@router.post("/breaks/{rid}/respond")
def respond(rid: int, body: RespondIn, request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    return _respond(rid, ctx.person_id, body.response)


class QuickIn(BaseModel):
    response: str = Field(pattern="^(accepted|declined)$")
    request_id: int | None = None


@router.post("/breaks/quick")
def quick(body: QuickIn, request: Request):
    """Ja/Nee vanuit de pushmelding (service worker). Zonder id: enkel als er precies één open vraag is."""
    ctx = load_ctx(request)
    access.need_person(ctx)
    rid = body.request_id
    if not rid:
        open_ = [x for x in list_for(ctx.person_id) if x["my_response"] == "pending"]
        if len(open_) != 1:
            raise HTTPException(409, {"code": "choose", "message": "Open de app om te kiezen."})
        rid = open_[0]["id"]
    return _respond(rid, ctx.person_id, body.response)


@router.post("/breaks/{rid}/cancel")
def cancel(rid: int, request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    r = _load(rid)
    if r["from_id"] != ctx.person_id and not ctx.admin:
        raise HTTPException(403, {"code": "notyours", "message": "Enkel wie het vroeg, kan het annuleren."})
    db.run("UPDATE break_requests SET cancelled_at=UTC_TIMESTAMP() WHERE id=%s", (rid,))
    for m in _members(rid):
        if m["response"] == "declined":
            continue
        notify.enqueue(m["person_id"], "pauze_verzoek", f"breq:{rid}:weg", "Pauze samen",
                       f"{r['from_name']} heeft de pauze van {_span(r)} geannuleerd.", {"open": "pauzes"}, r["day"])
    return {"ok": True}


class ProposeIn(BaseModel):
    start_min: int = Field(ge=0, le=24 * 60)
    end_min: int = Field(ge=0, le=24 * 60)


@router.post("/breaks/{rid}/propose")
def propose(rid: int, body: ProposeIn, request: Request):
    """Ander uur voorstellen: nee op het oude verzoek, en een nieuw verzoek terug naar wie vroeg."""
    ctx = load_ctx(request)
    access.need_person(ctx)
    access.rate_limit(f"breq:{ctx.person_id}", 30, 3600)
    r = _load(rid)
    mine = db.one("SELECT response FROM break_request_members WHERE request_id=%s AND person_id=%s", (rid, ctx.person_id))
    if not mine:
        raise HTTPException(404, {"code": "gone", "message": "Dit verzoek is niet voor jou."})
    new = _create(ctx.person_id, [r["from_id"]], r["day"], body.start_min, body.end_min, flip(r["mode"]), r["place"],
                  f"ander uur dan {_span(r)}", ignore=rid)
    db.run("UPDATE break_request_members SET response='declined', responded_at=UTC_TIMESTAMP() WHERE request_id=%s AND person_id=%s",
           (rid, ctx.person_id))
    return {"ok": True, "id": new}
