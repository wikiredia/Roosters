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
    n = 0
    for gid in sorted(groups_of(actor_ids, scope)):
        cid = group_chat(gid)
        n += bool(db.run(
            "INSERT IGNORE INTO chat_messages (chat_id, person_id, kind, body, payload, dedupe) VALUES (%s,%s,%s,%s,%s,%s)",
            (cid, None, kind, text[:2000], db.js(payload), dedupe[:190] if dedupe else None)))
    return n
