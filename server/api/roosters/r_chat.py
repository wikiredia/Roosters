"""Chat: groepschat van je vriendengroep (vastgepind), je woonplaats, en losse gesprekken.

Groepschats horen bij een groep (soort friends of home): wie in de groep zit, zit in de chat.
Losse gesprekken (dm) zijn tussen twee mensen en staan pas in je lijst zodra er iets in staat.
Gebeurtenissen (events.post) zijn kleine blokjes in het midden; die tellen mee voor het rode
bolletje maar geven nooit een pushmelding. Pushmeldingen voor berichten staan standaard uit,
per chat aan te zetten met de bel.
"""
import logging
import threading

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from . import access, db, events, notify
from .access import load_ctx
from .daydata import now_local
from .r_social import known_ids

log = logging.getLogger("roosters.chat")

router = APIRouter(prefix="/api")

PAGE = 50
MAX_LEN = 2000
CHAT_KINDS = ("friends", "home")
# Wie nog nooit een chat opende: enkel wat er de laatste dag bij kwam telt als ongelezen
FIRST_UNREAD_HOURS = 24


def _iso(v):
    return v.isoformat() + "Z" if v else None


def clean_text(text: str) -> str:
    """Spaties aan de randen weg, hoogstens 3 lege regels na elkaar, max. lengte."""
    lines = [line.rstrip() for line in (text or "").strip().splitlines()]
    out, blank = [], 0
    for line in lines:
        blank = blank + 1 if not line else 0
        if blank <= 1:
            out.append(line)
    return "\n".join(out)[:MAX_LEN]


def order_chats(chats: list) -> list:
    """Vriendengroep vastgepind bovenaan, dan woonplaats, dan losse gesprekken (laatste bericht eerst)."""
    rank = {"friends": 0, "home": 1, "dm": 2}
    return sorted(chats, key=lambda c: (rank[c["type"]], -(c["last"]["id"] if c.get("last") else 0) if c["type"] == "dm" else 0,
                                        c["title"].lower()))


# ---- Wie zit waar in ------------------------------------------------------------

def _my_groups(pid):
    return db.rows(
        "SELECT g.id, g.name, g.kind FROM user_groups g JOIN group_members gm ON gm.group_id=g.id "
        f"WHERE gm.person_id=%s AND g.deleted_at IS NULL AND g.kind IN ({','.join(['%s'] * len(CHAT_KINDS))}) ORDER BY g.name",
        (pid, *CHAT_KINDS))


def _chat_ids(pid, create=False) -> dict:
    """{chat_id: {"type", "group"?, "other"?}} voor alle chats van `pid`."""
    out = {}
    groups = _my_groups(pid)
    if create:
        for g in groups:
            events.group_chat(g["id"])
    if groups:
        rows = db.rows(f"SELECT id, group_id FROM chats WHERE group_id IN ({','.join(['%s'] * len(groups))})",
                       tuple(g["id"] for g in groups))
        by_gid = {g["id"]: g for g in groups}
        for r in rows:
            g = by_gid[r["group_id"]]
            out[r["id"]] = {"type": g["kind"], "group": g}
    for r in db.rows("SELECT c.id, IF(c.dm_a=%s, c.dm_b, c.dm_a) AS other, p.name FROM chats c "
                     "JOIN people p ON p.id=IF(c.dm_a=%s, c.dm_b, c.dm_a) AND p.deleted_at IS NULL "
                     "WHERE c.kind='dm' AND (c.dm_a=%s OR c.dm_b=%s)", (pid, pid, pid, pid)):
        out[r["id"]] = {"type": "dm", "other": {"id": r["other"], "name": r["name"]}}
    return out


def _members(info) -> list:
    if info["type"] == "dm":
        return [info["other"]]
    return db.rows("SELECT p.id, p.name FROM group_members gm JOIN people p ON p.id=gm.person_id AND p.deleted_at IS NULL "
                   "WHERE gm.group_id=%s ORDER BY p.name", (info["group"]["id"],))


def _member_ids(chat_id) -> set:
    c = db.one("SELECT * FROM chats WHERE id=%s", (chat_id,))
    if not c:
        return set()
    if c["kind"] == "dm":
        return {c["dm_a"], c["dm_b"]}
    g = db.one("SELECT kind FROM user_groups WHERE id=%s AND deleted_at IS NULL", (c["group_id"],))
    if not g or g["kind"] not in CHAT_KINDS:
        return set()
    return {r["person_id"] for r in db.rows(
        "SELECT gm.person_id FROM group_members gm JOIN people p ON p.id=gm.person_id AND p.deleted_at IS NULL "
        "WHERE gm.group_id=%s", (c["group_id"],))}


def _need_chat(ctx, chat_id) -> dict:
    access.need_person(ctx)
    mine = _chat_ids(ctx.person_id)
    if chat_id not in mine:
        raise HTTPException(404, {"code": "gone", "message": "Deze chat bestaat niet (meer) of je zit er niet in."})
    return mine[chat_id]


def _unread_counts(pid, chat_ids) -> dict:
    """Ongelezen per chat: wat na je laatst gelezen bericht kwam, niet van jezelf
    (ook geen gebeurtenis over jezelf, zoals 'Reda stopt nu met de les' voor Reda)."""
    if not chat_ids:
        return {}
    marks = ",".join(["%s"] * len(chat_ids))
    rows = db.rows(
        "SELECT m.chat_id, COUNT(*) AS n FROM chat_messages m "
        "LEFT JOIN chat_reads r ON r.chat_id=m.chat_id AND r.person_id=%s "
        f"WHERE m.chat_id IN ({marks}) AND m.deleted_at IS NULL "
        "AND (m.person_id IS NULL OR m.person_id<>%s) "
        "AND COALESCE(JSON_CONTAINS(JSON_EXTRACT(m.payload, '$.actors'), %s), 0)=0 "
        "AND ((r.person_id IS NOT NULL AND m.id > r.last_read) "
        f"  OR (r.person_id IS NULL AND m.created_at > UTC_TIMESTAMP() - INTERVAL {FIRST_UNREAD_HOURS} HOUR)) "
        "GROUP BY m.chat_id",
        (pid, *chat_ids, pid, str(pid)))
    return {r["chat_id"]: int(r["n"]) for r in rows}


def _message(r, me, names) -> dict:
    pid = r["person_id"]
    return {"id": r["id"], "kind": r["kind"], "body": r["body"], "payload": db.unjs(r["payload"], {}) or {},
            "person": {"id": pid, "name": names.get(pid, "?")} if pid else None,
            "mine": pid == me, "created": _iso(r["created_at"])}


def _names():
    return {r["id"]: r["name"] for r in db.rows("SELECT id, name FROM people")}


def _title(info) -> str:
    return info["other"]["name"] if info["type"] == "dm" else info["group"]["name"]


def _meta(chat_id, info, me) -> dict:
    push = db.one("SELECT push FROM chat_reads WHERE person_id=%s AND chat_id=%s", (me, chat_id))
    return {"id": chat_id, "type": info["type"], "title": _title(info), "pinned": info["type"] == "friends",
            "other": info.get("other"), "members": _members(info), "push": bool(push and push["push"])}


# ---- Lijst en ongelezen ---------------------------------------------------------

@router.get("/chat")
def chat_list(request: Request):
    ctx = load_ctx(request)
    access.need_person(ctx)
    me = ctx.person_id
    mine = _chat_ids(me, create=True)
    ids = list(mine)
    last = {}
    if ids:
        for r in db.rows(
            "SELECT m.* FROM chat_messages m JOIN (SELECT chat_id, MAX(id) AS id FROM chat_messages "
            f"WHERE deleted_at IS NULL AND chat_id IN ({','.join(['%s'] * len(ids))}) GROUP BY chat_id) x ON x.id=m.id",
                tuple(ids)):
            last[r["chat_id"]] = r
    reads = {r["chat_id"]: r for r in db.rows("SELECT chat_id, push FROM chat_reads WHERE person_id=%s", (me,))}
    unread = _unread_counts(me, ids)
    names = _names()
    out = []
    for cid, info in mine.items():
        # Losse gesprekken pas tonen als er iets in staat
        if info["type"] == "dm" and cid not in last:
            continue
        item = {"id": cid, "type": info["type"], "title": _title(info), "pinned": info["type"] == "friends",
                "other": info.get("other"), "unread": unread.get(cid, 0),
                "push": bool(reads.get(cid, {}).get("push")),
                "last": _message(last[cid], me, names) if cid in last else None}
        if info["type"] != "dm":
            item["members"] = len(_members(info))
        out.append(item)
    return {"chats": order_chats(out), "me": me}


@router.get("/chat/unread")
def chat_unread(request: Request):
    """Voor het rode bolletje: wordt elke 30 seconden opgevraagd, dus licht houden."""
    ctx = load_ctx(request)
    access.need_person(ctx)
    mine = _chat_ids(ctx.person_id)
    counts = _unread_counts(ctx.person_id, list(mine))
    return {"total": sum(counts.values()), "chats": {str(k): v for k, v in counts.items()}}


# ---- Berichten ------------------------------------------------------------------

@router.get("/chat/{chat_id}/messages")
def messages(chat_id: int, request: Request, after: int | None = None, before: int | None = None):
    """Standaard de laatste berichten; ?after=<id> wat erbij kwam (polling), ?before=<id> oudere."""
    ctx = load_ctx(request)
    info = _need_chat(ctx, chat_id)
    me = ctx.person_id
    if after is not None:
        rows = db.rows("SELECT * FROM chat_messages WHERE chat_id=%s AND id>%s AND deleted_at IS NULL ORDER BY id LIMIT 200",
                       (chat_id, after))
    elif before is not None:
        rows = db.rows("SELECT * FROM chat_messages WHERE chat_id=%s AND id<%s AND deleted_at IS NULL ORDER BY id DESC LIMIT %s",
                       (chat_id, before, PAGE))[::-1]
    else:
        rows = db.rows("SELECT * FROM chat_messages WHERE chat_id=%s AND deleted_at IS NULL ORDER BY id DESC LIMIT %s",
                       (chat_id, PAGE))[::-1]
    # Wat de laatste dag verwijderd werd, zodat een open chat het ook weghaalt
    deleted = [r["id"] for r in db.rows(
        "SELECT id FROM chat_messages WHERE chat_id=%s AND deleted_at > UTC_TIMESTAMP() - INTERVAL 1 DAY", (chat_id,))]
    names = _names()
    read = db.one("SELECT last_read FROM chat_reads WHERE person_id=%s AND chat_id=%s", (me, chat_id))
    out = {"messages": [_message(r, me, names) for r in rows], "deleted": deleted,
           "more": after is None and len(rows) == PAGE,
           "last_read": read["last_read"] if read else 0, "today": now_local().date().isoformat()}
    if after is None:
        out["chat"] = _meta(chat_id, info, me)
    return out


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


def _push_later(chat_id, sender, title, body):
    """Pushmelding naar wie de bel aanzette (in een draad: versturen kan even duren)."""
    targets = [r["person_id"] for r in db.rows(
        "SELECT person_id FROM chat_reads WHERE chat_id=%s AND push=1 AND person_id<>%s", (chat_id, sender))]
    targets = [pid for pid in targets if pid in _member_ids(chat_id) and notify.prefs(pid).get("chat", True)]
    if not targets:
        return

    def run():
        for pid in targets:
            try:
                subs = notify.subs_for_person(pid)
                if subs:
                    notify._send(subs, {"title": title, "body": body[:240], "url": f"/#/chat/{chat_id}", "tag": f"roosters-chat-{chat_id}"})
            except Exception as e:  # netwerk e.d.: nooit het bericht zelf laten mislukken
                log.warning("chat-push mislukt: %s", str(e)[:200])
    threading.Thread(target=run, daemon=True).start()


@router.post("/chat/{chat_id}/messages")
def send(chat_id: int, body: MessageIn, request: Request):
    ctx = load_ctx(request)
    info = _need_chat(ctx, chat_id)
    me = ctx.person_id
    text = clean_text(body.body)
    if not text:
        raise HTTPException(400, {"code": "empty", "message": "Typ eerst iets."})
    access.rate_limit(f"chat:{me}", 30, 60)
    mid = db.run("INSERT INTO chat_messages (chat_id, person_id, kind, body) VALUES (%s,%s,'text',%s)", (chat_id, me, text))
    _mark_read(me, chat_id, mid)
    names = _names()
    title = names.get(me, "?") if info["type"] == "dm" else f"{names.get(me, '?')} in {info['group']['name']}"
    _push_later(chat_id, me, title, text)
    row = db.one("SELECT * FROM chat_messages WHERE id=%s", (mid,))
    return {"ok": True, "message": _message(row, me, names)}


@router.delete("/chat/{chat_id}/messages/{mid}")
def delete_message(chat_id: int, mid: int, request: Request):
    ctx = load_ctx(request)
    _need_chat(ctx, chat_id)
    n = db.run("UPDATE chat_messages SET deleted_at=UTC_TIMESTAMP() WHERE id=%s AND chat_id=%s AND person_id=%s AND deleted_at IS NULL",
               (mid, chat_id, ctx.person_id))
    if not n:
        raise HTTPException(404, {"code": "gone", "message": "Dit bericht kan je niet verwijderen."})
    return {"ok": True}


# ---- Gelezen, bel, nieuw gesprek --------------------------------------------------

def _mark_read(pid, chat_id, upto):
    db.run("INSERT INTO chat_reads (person_id, chat_id, last_read) VALUES (%s,%s,%s) "
           "ON DUPLICATE KEY UPDATE last_read=GREATEST(last_read, VALUES(last_read))", (pid, chat_id, upto))


class ReadIn(BaseModel):
    upto: int | None = None


@router.post("/chat/{chat_id}/read")
def mark_read(chat_id: int, body: ReadIn, request: Request):
    ctx = load_ctx(request)
    _need_chat(ctx, chat_id)
    top = db.one("SELECT COALESCE(MAX(id), 0) AS id FROM chat_messages WHERE chat_id=%s", (chat_id,))["id"]
    _mark_read(ctx.person_id, chat_id, min(body.upto, top) if body.upto else top)
    return {"ok": True}


class PushIn(BaseModel):
    on: bool


@router.post("/chat/{chat_id}/push")
def set_push(chat_id: int, body: PushIn, request: Request):
    ctx = load_ctx(request)
    _need_chat(ctx, chat_id)
    top = db.one("SELECT COALESCE(MAX(id), 0) AS id FROM chat_messages WHERE chat_id=%s", (chat_id,))["id"]
    db.run("INSERT INTO chat_reads (person_id, chat_id, last_read, push) VALUES (%s,%s,%s,%s) "
           "ON DUPLICATE KEY UPDATE push=VALUES(push)", (ctx.person_id, chat_id, top, 1 if body.on else 0))
    return {"ok": True, "push": body.on}


@router.post("/chat/dm/{person_id}")
def open_dm(person_id: int, request: Request):
    """Gesprek met iemand openen (of maken). Enkel met wie je kent."""
    ctx = load_ctx(request)
    access.need_person(ctx)
    if person_id == ctx.person_id:
        raise HTTPException(400, {"code": "self", "message": "Dat ben je zelf."})
    other = db.one("SELECT id, name FROM people WHERE id=%s AND deleted_at IS NULL", (person_id,))
    if not other or person_id not in known_ids(ctx.person_id):
        raise HTTPException(404, {"code": "noperson", "message": "Met die persoon kan je (nog) niet chatten."})
    return {"id": events.dm_chat(ctx.person_id, person_id), "other": other}

