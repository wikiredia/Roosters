"""Jouw dag in één keer: je pauzes met wie er ook pauze heeft, wie samen met jou klaar is,
wie in Antwerpen blijft, en met wie je vaak pauze kan nemen (om voor te stellen bij Vergelijk).

Gedeeld door Rooster (pauze aantikken), Vergelijk (wie bovenaan) en Home.
"""
import datetime as dt

from fastapi import APIRouter, HTTPException, Request

from . import access, db, logic
from .access import load_ctx
from .daydata import load as load_day, now_local, now_min
from .r_social import known_ids

router = APIRouter(prefix="/api")

# 'Samen klaar': laatste les eindigt hoogstens zoveel minuten voor of na de jouwe
DONE_SAME_DIFF = 30


def _day_data(day: dt.date, today: dt.date):
    people, infos, campus_names = load_day(day)
    if day != today:
        # check-ins gelden enkel voor vandaag
        for p in people.values():
            p.checkin = None
        infos = {pid: logic.day_info(p) for pid, p in people.items()}
    return people, infos


def overview_for(pid: int, day: dt.date, viewer: int | None) -> dict:
    """Pure samenvatting voor `pid` op `day`, enkel met mensen die `viewer` kent."""
    today = now_local().date()
    people, infos = _day_data(day, today)
    me = people.get(pid)
    if not me:
        raise HTTPException(404, {"code": "noperson", "message": "Die persoon bestaat niet (meer)."})
    known = known_ids(viewer) if viewer else {pid}
    others = {oid: p for oid, p in people.items() if oid != pid and oid in known}
    info = infos[pid]
    ref = lambda oid: {"id": oid, "name": people[oid].name}  # noqa: E731
    chill_of = lambda oid: (people[oid].checkin or {}).get("status") if (people[oid].checkin or {}).get("status") in logic.CHILL else None  # noqa: E731

    last = info.busy[-1][1] if info.busy else None
    breaks = logic.gaps(info.busy)
    if info.left_at is not None:
        breaks = [(s, min(e, info.left_at)) for s, e in breaks if s < info.left_at]

    # Met wie overlap? (ook wie na school blijft chillen telt als vrij)
    pool = {pid: me, **others}
    partners = logic.partners(me, pool, infos)
    slots = []
    for s, e in breaks:
        ppl = [{**ref(x["id"]), "start": max(s, x["start"]), "end": min(e, x["end"]), "same_campus": x["same_campus"],
                "chill": chill_of(x["id"])}
               for x in partners if x["start"] < e and x["end"] > s and min(e, x["end"]) - max(s, x["start"]) >= logic.min_break(me, people[x["id"]])]
        ppl.sort(key=lambda p: (p["start"], -(p["end"] - p["start"]), p["name"].lower()))
        slots.append({"kind": "break", "start": s, "end": e, "people": ppl})

    after = None
    if last is not None and (info.left_at is None or info.left_at >= last):
        ci = me.checkin or {}
        until = (ci.get("until_min") or logic.LATE) if ci.get("status") in logic.CHILL else logic.LATE
        done_same = []
        for oid, o in others.items():
            oi = infos[oid]
            if not oi.present or not oi.busy:
                continue
            o_last = oi.left_at if oi.left_at is not None else oi.busy[-1][1]
            if abs(o_last - last) <= DONE_SAME_DIFF:
                done_same.append({**ref(oid), "end": o_last, "chill": chill_of(oid)})
        done_same.sort(key=lambda p: (abs(p["end"] - last), p["name"].lower()))
        chill = [{**ref(oid), "status": chill_of(oid), "until": (people[oid].checkin or {}).get("until_min")}
                 for oid in others if chill_of(oid)]
        chill.sort(key=lambda p: (p["status"] != "chilling", p["name"].lower()))
        free_after = [{**ref(x["id"]), "start": x["start"], "end": x["end"], "chill": chill_of(x["id"])}
                      for x in partners if x["start"] >= last]
        after = {"start": last, "end": until, "done_same": done_same, "chill": chill, "free": free_after,
                 "me_chill": ci.get("status") if ci.get("status") in logic.CHILL else None}

    # Met wie heb je deze dag het meest pauze samen? -> voorstellen bij Vergelijk
    mates = {}
    for sl in slots:
        for p in sl["people"]:
            m = mates.setdefault(p["id"], {**ref(p["id"]), "minutes": 0, "slots": [], "same_campus": p["same_campus"]})
            m["minutes"] += p["end"] - p["start"]
            m["slots"].append(sl["start"])
    mate_list = sorted(mates.values(), key=lambda m: (-m["minutes"], m["name"].lower()))
    # 'Zelfde schema': wie in elk van je pauzes (van 30+ minuten) ook vrij is
    real = [sl["start"] for sl in slots if sl["end"] - sl["start"] >= logic.SAME_CAMPUS_MIN]
    same_breaks = [m["id"] for m in mate_list if real and all(s in m["slots"] for s in real)]

    return {
        "person": ref(pid), "day": day.isoformat(), "today": today.isoformat(), "now_min": now_min(),
        "present": info.present, "first": info.first, "last": last,
        "slots": slots, "after": after, "mates": mate_list, "same_breaks": same_breaks,
    }


@router.get("/overview")
def overview(request: Request, day: str | None = None, pid: int | None = None):
    """?day=YYYY-MM-DD (standaard vandaag), ?pid= (standaard jij)."""
    ctx = load_ctx(request)
    access.need_read(ctx, "probeerde een dagoverzicht te openen")
    who = pid or ctx.person_id
    if not who:
        raise HTTPException(400, {"code": "noperson", "message": "Kies eerst wie je bent."})
    try:
        d = dt.date.fromisoformat(day) if day else now_local().date()
    except ValueError:
        raise HTTPException(400, {"code": "day", "message": "Ongeldige dag."})
    return overview_for(who, d, ctx.person_id)
