"""Pauzes, samen-vrij, nu-bord en samen-reizen. Alleen pure functies (geen database).

Tijden zijn minuten sinds middernacht (Brussel).

Een pauze = tijd zonder les TUSSEN je eerste en laatste les. Vóór je eerste les en na je
laatste les ben je niet op school; een dag zonder les telt ook niet als vrije tijd.
Uitzondering: wie zegt dat hij/zij in Antwerpen blijft chillen, is ook na de laatste les vrij.
"""
from dataclasses import dataclass, field

# ---- Instellingen -----------------------------------------------------------
# Kortste pauze samen op dezelfde campus (minuten)
SAME_CAMPUS_MIN = 30
# Andere campus: pauzes van 30 minuten of korter tellen niet
OTHER_CAMPUS_MIN = 31
# 'Blijf chillen' zonder einduur: tot dit uur
LATE = 22 * 60
# Samen naar school/huis: maximaal verschil in begin- of einduur (minuten)
TRAVEL_MAX_DIFF = 15

CHILL = ("chilling", "want_chill")


@dataclass
class PersonDay:
    id: int
    name: str
    lessons: list = field(default_factory=list)  # [(start, end)] enkel lessen die doorgaan
    campus: set = field(default_factory=set)
    home: set = field(default_factory=set)
    friends: set = field(default_factory=set)
    checkin: dict | None = None


def merge(intervals):
    out = []
    for s, e in sorted(intervals):
        if e <= s:
            continue
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return [tuple(x) for x in out]


def gaps(busy):
    return [(busy[i - 1][1], busy[i][0]) for i in range(1, len(busy)) if busy[i][0] > busy[i - 1][1]]


@dataclass
class DayInfo:
    present: bool
    first: int | None
    last: int | None
    busy: list
    free: list
    left_at: int | None = None


def day_info(p: PersonDay) -> DayInfo:
    ci = p.checkin or {}
    status = ci.get("status")
    if status == "absent":
        return DayInfo(False, None, None, [], [])
    busy = merge(p.lessons)
    first = busy[0][0] if busy else None
    last = busy[-1][1] if busy else None
    free = gaps(busy)
    present = bool(busy)
    if status in CHILL:
        until = ci.get("until_min") or LATE
        start = last if busy else ci.get("since_min", 0)
        if until > start:
            free = merge(free + [(start, until)])
            present = True
            last = max(last or 0, until)
            if first is None:
                first = start
    left_at = None
    if status == "home":
        t = ci.get("since_min", 0)
        left_at = t
        free = [(s, min(e, t)) for s, e in free if s < t]
        if last is not None and t < last:
            last = max(t, first or t)
    return DayInfo(present, first, last, busy, free, left_at)


def overlaps(a, b):
    out = []
    for s1, e1 in a:
        for s2, e2 in b:
            s, e = max(s1, s2), min(e1, e2)
            if e > s:
                out.append((s, e))
    return sorted(out)


def same_campus(a: PersonDay, b: PersonDay) -> bool:
    return bool(a.campus & b.campus)


def min_break(a: PersonDay, b: PersonDay) -> int:
    return SAME_CAMPUS_MIN if same_campus(a, b) else OTHER_CAMPUS_MIN


def pair_breaks(a: PersonDay, b: PersonDay, ia: DayInfo, ib: DayInfo):
    if not ia.present or not ib.present:
        return []
    need = min_break(a, b)
    return [(s, e) for s, e in overlaps(ia.free, ib.free) if e - s >= need]


def partners(me: PersonDay, people: dict, infos: dict, after: int = 0):
    """Met wie heb ik (nog) pauze vandaag? -> [{id, start, end, same_campus}]"""
    out = []
    for pid, other in people.items():
        if pid == me.id:
            continue
        for s, e in pair_breaks(me, other, infos[me.id], infos[pid]):
            if e > after:
                out.append({"id": pid, "start": s, "end": e, "same_campus": same_campus(me, other)})
    out.sort(key=lambda x: (x["start"], x["id"]))
    return out


def campus_windows(people: dict, infos: dict, campus_names: dict):
    """Per campus: wanneer hebben 2+ mensen samen pauze. -> [{campus, name, start, end, people}]"""
    result = []
    for gid, gname in campus_names.items():
        members = [p for p in people.values() if gid in p.campus and infos[p.id].present and infos[p.id].free]
        if len(members) < 2:
            continue
        points = sorted({t for p in members for iv in infos[p.id].free for t in iv})
        segs = []
        for i in range(len(points) - 1):
            s, e = points[i], points[i + 1]
            who = {p.id for p in members if any(fs <= s and e <= fe for fs, fe in infos[p.id].free)}
            segs.append((s, e, who))
        # aaneengesloten stukken met minstens 2 mensen
        windows, cur = [], None
        for s, e, who in segs:
            if len(who) >= 2:
                if cur and cur[1] == s:
                    cur[1] = e
                    cur[2] |= who
                else:
                    cur = [s, e, set(who)]
                    windows.append(cur)
            else:
                cur = None
        for ws, we, who in windows:
            parts, starts, ends = set(), [], []
            ids = sorted(who)
            for i, a in enumerate(ids):
                for b in ids[i + 1:]:
                    for s, e in overlaps(infos[a].free, infos[b].free):
                        s, e = max(s, ws), min(e, we)
                        if e - s >= SAME_CAMPUS_MIN:
                            parts |= {a, b}
                            starts.append(s)
                            ends.append(e)
            if len(parts) >= 2:
                result.append({"campus": gid, "name": gname, "start": min(starts), "end": max(ends),
                               "people": sorted(parts, key=lambda x: people[x].name.lower())})
    result.sort(key=lambda w: (w["start"], w["name"]))
    return result


def compare_matches(people: list, infos: dict):
    """Vergelijken: elke groep van 2+ mensen die samen pauze heeft, niet enkel 'iedereen tegelijk'.
    -> [{ids, start, end}] (ids in de volgorde van `people`). Een groep die volledig binnen een
    grotere groep met hetzelfde of een langer moment valt, laten we weg."""
    present = [p for p in people if infos[p.id].present and infos[p.id].free]
    points = sorted({t for p in present for iv in infos[p.id].free for t in iv})
    segs = []
    for s, e in zip(points, points[1:]):
        who = frozenset(p.id for p in present if any(fs <= s and e <= fe for fs, fe in infos[p.id].free))
        if len(who) >= 2:
            segs.append((s, e, who))
    # Kandidaten: wie samen vrij is in een stuk, en wat twee zulke groepen gemeen hebben
    # (A en C kunnen samen langer vrij zijn dan elk groepje waarin ze zitten)
    cands = {who for _, _, who in segs}
    grew = True
    while grew and len(cands) < 400:
        grew = False
        for a in list(cands):
            for b in list(cands):
                c = a & b
                if len(c) >= 2 and c not in cands:
                    cands.add(c)
                    grew = True
    by_id = {p.id: p for p in present}
    found = []
    for group in cands:
        ids = sorted(group)
        need = max(min_break(by_id[a], by_id[b]) for i, a in enumerate(ids) for b in ids[i + 1:])
        runs = []
        for s, e, who in segs:
            if not group <= who:
                continue
            if runs and runs[-1][1] == s:
                runs[-1][1] = e
            else:
                runs.append([s, e])
        found += [(group, (s, e)) for s, e in runs if e - s >= need]
    keep = [(g, s, e) for g, (s, e) in found
            if not any(g < g2 and s2 <= s and e <= e2 for g2, (s2, e2) in found)]
    order = {p.id: i for i, p in enumerate(people)}
    out = [{"ids": sorted(g, key=order.get), "start": s, "end": e} for g, s, e in keep]
    out.sort(key=lambda m: (m["start"], -len(m["ids"]), m["end"]))
    return out


def now_status(p: PersonDay, info: DayInfo, now: int) -> dict:
    """Eén regel voor het nu-bord."""
    ci = p.checkin or {}
    st = ci.get("status")
    if st == "absent":
        return {"code": "absent", "text": "Is er vandaag niet", "rank": 6}
    if info.left_at is not None and now >= info.left_at:
        return {"code": "home", "text": "Naar huis", "rank": 5}
    busy = info.busy
    for s, e in busy:
        if s <= now < e:
            return {"code": "les", "text": f"In les tot {fmt(e)}", "until": e, "rank": 2}
    if busy and now < busy[0][0]:
        return {"code": "straks", "text": f"Les om {fmt(busy[0][0])}", "until": busy[0][0], "rank": 3}
    for s, e in info.free:
        if s <= now < e:
            if busy and now < busy[-1][1]:
                return {"code": "pauze", "text": f"Pauze tot {fmt(e)}", "until": e, "rank": 0}
            label = "Aan het chillen" if st == "chilling" else "Wil chillen"
            tail = "" if e >= LATE else f" tot {fmt(e)}"
            return {"code": "chill", "text": label + tail, "until": e, "rank": 1}
    if busy:
        return {"code": "klaar", "text": "Klaar voor vandaag", "rank": 4}
    return {"code": "geen", "text": "Geen les vandaag", "rank": 7}


# 'Vraag om te chillen' kan vanaf zoveel minuten voor het einde van een les (of je laatste les)
PING_SOON = 20
# ... en tot zoveel minuten na je laatste les (daarna ben je wellicht al weg)
PING_AFTER = 60


def board_status(p: PersonDay, info: DayInfo, now: int) -> dict:
    """Nu-bord met meer uitleg: een hoofdregel (text), een tweede regel (sub, of None), en of je
    die persoon kan vragen om te chillen (can_ping: niet in les, of pauze/klaar binnen PING_SOON).
    -> {code, text, sub, can_ping, rank, until}"""
    ci = p.checkin or {}
    st = ci.get("status")
    busy = info.busy
    last = busy[-1][1] if busy else None
    if st == "absent":
        return {"code": "absent", "text": "Is er vandaag niet", "sub": None, "can_ping": False, "rank": 6, "until": None}
    if info.left_at is not None and now >= info.left_at:
        return {"code": "home", "text": f"Naar huis sinds {fmt(info.left_at)}", "sub": None, "can_ping": False, "rank": 5,
                "until": None}
    breaks = [(s, e) for s, e in info.free if last is not None and e <= last]
    home_at = f"Gaat naar huis om {fmt(last)}" if last is not None and st not in CHILL else None
    for s, e in busy:
        if s <= now < e:
            nxt = next(((bs, be) for bs, be in breaks if bs >= e), None)
            sub = f"Heeft pauze om {fmt(nxt[0])}" if nxt else home_at
            return {"code": "les", "text": f"Heeft nog les tot {fmt(e)}", "sub": sub, "can_ping": e - now <= PING_SOON,
                    "rank": 2, "until": e}
    if busy and now < busy[0][0]:
        return {"code": "straks", "text": f"Les om {fmt(busy[0][0])}", "sub": home_at, "can_ping": False, "rank": 3,
                "until": busy[0][0]}
    for s, e in info.free:
        if s <= now < e:
            if last is not None and now < last:
                return {"code": "pauze", "text": f"Heeft pauze tot {fmt(e)}", "sub": home_at, "can_ping": True, "rank": 0,
                        "until": e}
            label = "Aan het chillen in Antwerpen" if st == "chilling" else "Wil chillen in Antwerpen"
            tail = "" if e >= LATE else f" (tot {fmt(e)})"
            return {"code": "chill", "text": label + tail, "sub": None, "can_ping": True, "rank": 1, "until": e}
    if busy:
        return {"code": "klaar", "text": f"Klaar sinds {fmt(last)}", "sub": None, "can_ping": now - last <= PING_AFTER,
                "rank": 4, "until": None}
    return {"code": "geen", "text": "Geen les vandaag", "sub": None, "can_ping": False, "rank": 7, "until": None}


def travel_pairs(people: dict, infos: dict, prefs: dict):
    """Samen naar school (zelfde woonplaats, zelfde campus, eerste les ±15 min) en samen naar huis.

    prefs[(a, b)] = 'never' | 'always'. 'always' = zelf toegevoegd: dan hoeft de campus niet gelijk.
    -> [{a, b, kind: 'heen'|'terug', time_a, time_b}]
    """
    out = []
    ids = sorted(people)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            pa, pb = people[a], people[b]
            ia, ib = infos[a], infos[b]
            if not ia.busy or not ib.busy or not ia.present or not ib.present:
                continue
            if not pa.home & pb.home:
                continue
            pref_ab, pref_ba = prefs.get((a, b)), prefs.get((b, a))
            if "never" in (pref_ab, pref_ba):
                continue
            if not same_campus(pa, pb) and "always" not in (pref_ab, pref_ba):
                continue
            if abs(ia.busy[0][0] - ib.busy[0][0]) <= TRAVEL_MAX_DIFF:
                out.append({"a": a, "b": b, "kind": "heen", "time_a": ia.busy[0][0], "time_b": ib.busy[0][0]})
            la = ia.left_at if ia.left_at is not None else ia.busy[-1][1]
            lb = ib.left_at if ib.left_at is not None else ib.busy[-1][1]
            if abs(la - lb) <= TRAVEL_MAX_DIFF:
                out.append({"a": a, "b": b, "kind": "terug", "time_a": la, "time_b": lb})
    return out


def fmt(m: int) -> str:
    return f"{m // 60}:{m % 60:02d}"


def duration(m: int) -> str:
    h, r = divmod(m, 60)
    if h and r:
        return f"{h}u{r:02d}"
    if h:
        return f"{h} {'uur' if h == 1 else 'uren'}"
    return f"{r} min"


def names(lst) -> str:
    lst = list(lst)
    if len(lst) <= 1:
        return "".join(lst)
    return ", ".join(lst[:-1]) + " & " + lst[-1]
