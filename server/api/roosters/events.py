"""Gebeurtenissen in de groepschat: kleine blokjes in het midden ("Reda stopt nu met de les").

Geen pushmeldingen: enkel het rode bolletje met een getal op het Chat-icoon (ongelezen).
Iedereen die iets doet wat de rest van de groep aangaat, roept `post` aan.
"""
import datetime as dt

from . import db

# Waar komt een gebeurtenis terecht? friends = je vriendengroep(en), home = je woonplaats-groep(en)
SCOPES = ("friends", "home")


def group_chat(group_id: int) -> int:
    """Chat van een groep (wordt aangemaakt de eerste keer)."""
    row = db.one("SELECT id FROM chats WHERE group_id=%s", (group_id,))
    if row:
        return row["id"]
    db.run("INSERT IGNORE INTO chats (kind, group_id) VALUES ('group', %s)", (group_id,))
    return db.one("SELECT id FROM chats WHERE group_id=%s", (group_id,))["id"]


def dm_chat(a: int, b: int) -> int:
    """Chat tussen twee mensen (wordt aangemaakt de eerste keer)."""
    lo, hi = sorted((a, b))
    row = db.one("SELECT id FROM chats WHERE dm_a=%s AND dm_b=%s", (lo, hi))
    if row:
        return row["id"]
    db.run("INSERT IGNORE INTO chats (kind, dm_a, dm_b) VALUES ('dm', %s, %s)", (lo, hi))
    return db.one("SELECT id FROM chats WHERE dm_a=%s AND dm_b=%s", (lo, hi))["id"]


def groups_of(person_ids, kind: str) -> set:
    ids = list(person_ids)
    if not ids:
        return set()
    return {r["id"] for r in db.rows(
        f"SELECT DISTINCT g.id FROM user_groups g JOIN group_members gm ON gm.group_id=g.id "
        f"WHERE g.kind=%s AND g.deleted_at IS NULL AND gm.person_id IN ({','.join(['%s'] * len(ids))})",
        (kind, *ids))}


def post(actor_ids, text: str, *, kind: str = "event", scope: str = "friends", payload: dict | None = None,
         dedupe: str | None = None, day: dt.date | None = None) -> int:
    """Zet een gebeurtenis in elke groepschat (van soort `scope`) waar een van `actor_ids` in zit.

    `actor_ids`: wie het doet (één id of een lijst). `dedupe`: dezelfde sleutel komt maar één keer
    in dezelfde chat (handig voor de worker die elke minuut draait). `payload` mag bv.
    {"people": [ids], "day": "YYYY-MM-DD", "start": min, "end": min, "open": "vergelijk"} bevatten:
    de chat maakt het blokje dan aantikbaar. Geeft het aantal chats terug waarin het kwam.
    """
    if isinstance(actor_ids, int):
        actor_ids = [actor_ids]
    if scope not in SCOPES:
        raise ValueError(scope)
    payload = dict(payload or {})
    payload.setdefault("actors", list(actor_ids))
    if day:
        payload.setdefault("day", day.isoformat())
    return sum(post_group(gid, text, kind=kind, payload=payload, dedupe=dedupe) for gid in sorted(groups_of(actor_ids, scope)))


def post_group(group_id: int, text: str, *, kind: str = "event", payload: dict | None = None, dedupe: str | None = None) -> bool:
    """Eén gebeurtenis in de chat van één groep. True als ze erbij kwam (niet al eerder gemeld)."""
    cid = group_chat(group_id)
    return bool(db.run(
        "INSERT IGNORE INTO chat_messages (chat_id, person_id, kind, body, payload, dedupe) VALUES (%s,%s,%s,%s,%s,%s)",
        (cid, None, kind, text[:2000], db.js(payload or {}), dedupe[:190] if dedupe else None)))


# ---- Wat de worker elke minuut in de groepschat zet (pure functies, zonder database) ----

# Hoe lang na het moment zelf mag de worker het nog melden (hij kan een minuut of wat te laat zijn)
WINDOW = 10


def done_now(member_ids, people, infos, now: int, window: int = WINDOW):
    """Wie van `member_ids` stopt nu met de les? -> [(einde, [ids])], per einduur samengenomen.
    Wie al naar huis ging of er niet is, telt niet."""
    by_end = {}
    for pid in member_ids:
        p, info = people.get(pid), infos.get(pid)
        if not p or not info or not info.present or not info.busy or info.left_at is not None:
            continue
        end = info.busy[-1][1]
        if end <= now < end + window:
            by_end.setdefault(end, []).append(pid)
    return sorted((end, sorted(ids, key=lambda i: people[i].name.lower())) for end, ids in by_end.items())


def breaks_starting(member_ids, people, infos, now: int, window: int = WINDOW):
    """Pauzes die nu beginnen met 2+ mensen uit dezelfde groep -> [{ids, start, end}].
    Enkel echte pauzes tussen lessen (wie na school blijft chillen, meldt dat zelf al)."""
    from .logic import compare_matches

    members = [people[pid] for pid in member_ids if pid in people]
    out = []
    for m in compare_matches(members, infos):
        if not m["start"] <= now < m["start"] + window:
            continue
        # Na de laatste les van iedereen is het geen pauze meer
        if all(infos[i].busy and m["start"] >= infos[i].busy[-1][1] for i in m["ids"]):
            continue
        out.append(m)
    return out


def done_text(names_: list) -> str:
    from .logic import names

    return f"{names(names_)} {'stopt' if len(names_) == 1 else 'stoppen'} nu met de les"


def break_text(names_: list, end: int) -> str:
    from .logic import fmt, names

    return f"{names(names_)} hebben nu samen pauze (tot {fmt(end)})"
