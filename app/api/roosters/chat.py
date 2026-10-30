"""Chat: one-to-one with a friend, and groups of friends ("De bende"). Text messages, events the app turns
into a sentence ("Lotte en Amir pakken samen pauze om 12:30"), and request cards: a break request (breaks.py) or an
access request (access.py) as a message of kind 'request' that always shows the request as it is now. Read up to where (unread counts, "gelezen"),
pinned chats, and moderation: report a message (the writer never knows), block the writer, take back your own.
The routes are in r_chat.py; the moderators' side (open reports) is in admin.py.

Who sees what:
- a one-to-one chat only while you're friends (unfriending or blocking hides it for both; becoming friends again
  brings it back with its history)
- a group: whoever is in it; anyone in it can add their own friends, and leave
- messages from someone you blocked are gone for you (in groups too); they don't notice

Push: the bell per chat (`chat_members.push`, off by default); `send` queues push.py's `push_chat` job.

Request cards: `post_request` puts one in the direct chat with each person asked, or, when a group of exactly the
asker and those people exists, once in that group. The message only points at the request (`payload`
{type, request}); `messages` and `list_for` add the live request (`request`, the viewer's view, null when it's not
for them any more), so the ETag of those answers changes with it. `requests` in the chat list: open requests in
that chat that involve you (the yellow "Verzoek" tag).

Tables: chats, chat_members, chat_messages, chat_reports (migrations/0009_chat.sql, 0013_push.sql,
0016_request_cards.sql)."""
import datetime as dt
import re

from . import db, friends, jobs, tokens
from .errors import ApiError

MAX_BODY = 1000
MAX_GROUP = 30          # people in a group, you included
MAX_NAME = 40
PAGE = 50
REASONS = ("spam", "mean", "unsafe", "other")


# ---- Pure parts --------------------------------------------------------------------

def direct_key(a: int, b: int) -> str:
    """The one one-to-one chat of a pair, whoever opens it."""
    return f"{min(a, b)}:{max(a, b)}"


def clean_body(text: str | None) -> str | None:
    """What gets stored: no spaces around it, at most one empty line in a row, None when nothing is left."""
    t = re.sub(r"[ \t]+\n", "\n", (text or "").replace("\r\n", "\n")).strip()
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t or None


def clean_name(name: str | None) -> str:
    n = re.sub(r"\s+", " ", name or "").strip()
    if not n:
        raise ApiError(400, "chat_name")
    return n[:MAX_NAME]


# ---- Reading -----------------------------------------------------------------------

def _ts(v: dt.datetime) -> str:
    return v.replace(microsecond=(v.microsecond // 1000) * 1000).isoformat(timespec="milliseconds") + "Z"


def message_out(r: dict) -> dict:
    gone = r["deleted_at"] is not None
    return {"id": r["id"], "chat_id": r["chat_id"], "kind": r["kind"], "user_id": r["user_id"],
            "body": None if gone else r["body"], "payload": db.unjs(r["payload"], None),
            "created_at": _ts(r["created_at"]), "deleted": gone, "removed": bool(r["removed"])}


def _person(u: dict) -> dict:
    return {"id": u["id"], "display_name": u["display_name"], "avatar_color": u["avatar_color"], "photo": u.get("photo_v")}


def _friend_ids(uid: int, c=None) -> set[int]:
    return {r["friend_id"] for r in db.rows("SELECT friend_id FROM friendships WHERE user_id=%s", (uid,), c)}


def _members(chat_ids: list[int], c=None) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {i: [] for i in chat_ids}
    if not chat_ids:
        return out
    ph, args = db.in_list(chat_ids)
    for r in db.rows(f"SELECT m.chat_id, m.last_read_id, m.joined_at, u.id, u.display_name, u.avatar_color, u.photo_v "
                     f"FROM chat_members m JOIN users u ON u.id=m.user_id WHERE m.chat_id IN ({ph}) "
                     f"ORDER BY u.display_name", args, c):
        out[r["chat_id"]].append(r)
    return out


def _not_blocked(col: str, blocked: set[int]) -> tuple[str, list]:
    """SQL that leaves out messages written by people you blocked (events have no writer and stay).
    Nothing when you blocked nobody: `NOT IN (NULL)` would match nothing at all."""
    if not blocked:
        return "", []
    ph, args = db.in_list(blocked)
    return f" AND ({col} IS NULL OR {col} NOT IN ({ph}))", args


def _visible(uid: int, chat: dict, members: list[dict], mates: set[int]) -> bool:
    """A one-to-one chat only while the two are friends; a group while you're in it."""
    if chat["kind"] == "group":
        return True
    others = [m["id"] for m in members if m["id"] != uid]
    return len(others) == 1 and others[0] in mates


def _summary(uid: int, chat: dict, members: list[dict], mine: dict, last: dict | None, unread: int,
             requests: int = 0) -> dict:
    others = [m for m in members if m["id"] != uid]
    out = {"id": chat["id"], "kind": chat["kind"], "pinned": bool(mine["pinned"]), "push": bool(mine["push"]), "unread": unread,
           "requests": requests, "last_read_id": mine["last_read_id"], "last": message_out(last) if last else None,
           "members": [_person(m) for m in others], "count": len(members)}
    if chat["kind"] == "direct":
        out["name"] = others[0]["display_name"] if others else None
        out["with_id"] = others[0]["id"] if others else None
        out["avatar_color"] = others[0]["avatar_color"] if others else 0
        out["photo"] = others[0]["photo_v"] if others else None
    else:
        out["name"] = chat["name"]
    return out


def _ref(m: dict) -> tuple[str, int] | None:
    """(type, request id) of a request card."""
    p = m.get("payload") or {}
    if m["kind"] != "request" or p.get("type") not in ("break", "access") or not isinstance(p.get("request"), int):
        return None
    return p["type"], p["request"]


def with_requests(user: dict, msgs: list[dict]) -> list[dict]:
    """Adds `request` to the request cards among these messages: the request as it is now, from `user`'s side
    (breaks.cards / access.cards), or None when it isn't for them any more."""
    from . import access, breaks  # they post cards through this module
    refs = [r for m in msgs if (r := _ref(m))]
    if not refs:
        return msgs
    found = {("break", k): v for k, v in breaks.cards(user, [i for t, i in refs if t == "break"]).items()}
    found |= {("access", k): v for k, v in access.cards(user["id"], [i for t, i in refs if t == "access"]).items()}
    for m in msgs:
        if m["kind"] == "request":
            r = _ref(m)
            m["request"] = found.get(r) if r else None
    return msgs


def _open_requests(user: dict, chat_ids: list[int]) -> dict[int, int]:
    """Per chat: how many request cards in it are still open and involve you. A break request: still pending and
    not over, and you asked or haven't answered yet; an access request: pending (you asked, or it's for you)."""
    from . import access, breaks
    open_ = {("break", b["id"]) for b in breaks.list_for(user)
             if b["state"] == "pending" and (b["mine"] or b["my_response"] == "pending")}
    open_ |= {("access", i) for i in access.open_ids(user["id"])}
    if not open_ or not chat_ids:
        return {}
    ph, args = db.in_list(chat_ids)
    out: dict[int, int] = {}
    for r in db.rows(f"SELECT chat_id, kind, payload FROM chat_messages WHERE chat_id IN ({ph}) AND kind='request'", args):
        if _ref({**r, "payload": db.unjs(r["payload"], None)}) in open_:
            out[r["chat_id"]] = out.get(r["chat_id"], 0) + 1
    return out


def list_for(user: dict) -> dict:
    """Your chats, pinned first, then the latest message first; with what's unread, the open requests in it and the
    newest message you can see. -> {"chats": [...], "unread": total unread messages}"""
    uid = user["id"]
    rows = db.rows("SELECT c.*, m.last_read_id, m.pinned, m.push FROM chat_members m JOIN chats c ON c.id=m.chat_id "
                   "WHERE m.user_id=%s", (uid,))
    members = _members([r["id"] for r in rows])
    mates = _friend_ids(uid)
    rows = [r for r in rows if _visible(uid, r, members[r["id"]], mates)]
    if not rows:
        return {"chats": [], "unread": 0}
    ids = [r["id"] for r in rows]
    blocked = friends.blocked_by(uid)
    ph, args = db.in_list(ids)
    nb, nbargs = _not_blocked("user_id", blocked)
    lasts = {r["chat_id"]: r for r in db.rows(
        f"SELECT msg.* FROM chat_messages msg JOIN (SELECT chat_id, MAX(id) AS id FROM chat_messages "
        f"WHERE chat_id IN ({ph}){nb} GROUP BY chat_id) x ON x.id=msg.id", args + nbargs)}
    nb, nbargs = _not_blocked("msg.user_id", blocked)
    unread = {r["chat_id"]: r["n"] for r in db.rows(
        f"SELECT msg.chat_id, COUNT(*) AS n FROM chat_messages msg JOIN chat_members m ON m.chat_id=msg.chat_id "
        f"AND m.user_id=%s WHERE msg.chat_id IN ({ph}) AND msg.id > m.last_read_id AND msg.kind='text' "
        f"AND msg.deleted_at IS NULL AND msg.user_id <> %s{nb} GROUP BY msg.chat_id",
        [uid] + args + [uid] + nbargs)}
    requests = _open_requests(user, ids)
    out = [_summary(uid, r, members[r["id"]], r, lasts.get(r["id"]), unread.get(r["id"], 0), requests.get(r["id"], 0))
           for r in rows]
    with_requests(user, [s["last"] for s in out if s["last"]])
    out.sort(key=lambda s: (not s["pinned"], -(s["last"]["id"] if s["last"] else 0), -s["id"]))
    return {"chats": out, "unread": sum(s["unread"] for s in out)}


def _load(uid: int, chat_id: int, c=None, lock: bool = False) -> tuple[dict, list[dict], dict]:
    """The chat, its members and your membership, or 404 chat_gone (not in it, or not friends any more)."""
    chat = db.one("SELECT * FROM chats WHERE id=%s" + (" FOR UPDATE" if lock else ""), (chat_id,), c)
    mine = db.one("SELECT * FROM chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, uid), c) if chat else None
    if mine is None:
        raise ApiError(404, "chat_gone")
    members = _members([chat_id], c)[chat_id]
    if not _visible(uid, chat, members, _friend_ids(uid, c)):
        raise ApiError(404, "chat_gone")
    return chat, members, mine


def chat_out(uid: int, chat_id: int) -> dict:
    """One chat with everyone in it (and how far each of them read: "gelezen"), for the conversation screen."""
    chat, members, mine = _load(uid, chat_id)
    s = _summary(uid, chat, members, mine, None, 0)
    mates = _friend_ids(uid)
    s.pop("last")
    s["people"] = [{**_person(m), "last_read_id": m["last_read_id"], "me": m["id"] == uid,
                    "friend": m["id"] in mates} for m in members]
    s["created_by"] = chat["created_by"]
    return s


def messages(user: dict, chat_id: int, after: int = 0, before: int = 0, limit: int = PAGE) -> dict:
    """Oldest first. after: only newer ones (asking every few seconds while the chat is open); before: the page
    above (scrolling up); neither: the newest page. Request cards carry the live request (`with_requests`).
    -> {"messages", "more": older ones exist}"""
    uid = user["id"]
    _load(uid, chat_id)
    limit = max(1, min(limit, 100))
    nb, nbargs = _not_blocked("user_id", friends.blocked_by(uid))
    where = f"chat_id=%s{nb}"
    args = [chat_id] + nbargs
    if after:
        rows = db.rows(f"SELECT * FROM chat_messages WHERE {where} AND id > %s ORDER BY id LIMIT %s",
                       args + [after, limit])
        return {"messages": with_requests(user, [message_out(r) for r in rows]), "more": False}
    if before:
        where += " AND id < %s"
        args.append(before)
    rows = db.rows(f"SELECT * FROM chat_messages WHERE {where} ORDER BY id DESC LIMIT %s", args + [limit + 1])
    more = len(rows) > limit
    return {"messages": with_requests(user, [message_out(r) for r in reversed(rows[:limit])]), "more": more}


# ---- Writing -----------------------------------------------------------------------

def _add_event(c, chat_id: int, payload: dict) -> int:
    mid = db.run("INSERT INTO chat_messages (chat_id, kind, payload) VALUES (%s,'event',%s)", (chat_id, db.js(payload)), c)
    db.run("UPDATE chats SET last_message_id=%s WHERE id=%s", (mid, chat_id), c)
    return mid


def _names(c, ids: list[int]) -> dict[str, str]:
    ph, args = db.in_list(ids)
    return {str(r["id"]): r["display_name"] for r in db.rows(f"SELECT id, display_name FROM users WHERE id IN ({ph})", args, c)}


def open_direct(c, uid: int, other: int) -> int:
    """The one-to-one chat with a friend (made the first time). -> chat id"""
    if other == uid or friends.blocked_between(uid, other, c) or other not in _friend_ids(uid, c):
        raise ApiError(404, "not_friends")
    key = direct_key(uid, other)
    db.run("INSERT IGNORE INTO chats (kind, direct_key, created_by) VALUES ('direct',%s,%s)", (key, uid), c)
    chat_id = db.one("SELECT id FROM chats WHERE direct_key=%s", (key,), c)["id"]
    db.run("INSERT IGNORE INTO chat_members (chat_id, user_id) VALUES (%s,%s),(%s,%s)", (chat_id, uid, chat_id, other), c)
    return chat_id


def _check_friends(c, uid: int, ids: list[int]) -> list[int]:
    ids = sorted({i for i in ids if i != uid})
    mates = _friend_ids(uid, c)
    if any(i not in mates for i in ids):
        raise ApiError(404, "not_friends")
    return ids


def create_group(c, uid: int, name: str, ids: list[int]) -> int:
    """A group with friends of yours (at least one). -> chat id"""
    name = clean_name(name)
    ids = _check_friends(c, uid, ids)
    if not ids:
        raise ApiError(400, "chat_people")
    if len(ids) + 1 > MAX_GROUP:
        raise ApiError(400, "chat_full", limit=MAX_GROUP)
    chat_id = db.run("INSERT INTO chats (kind, name, created_by) VALUES ('group',%s,%s)", (name, uid), c)
    db.many("INSERT INTO chat_members (chat_id, user_id) VALUES (%s,%s)", [(chat_id, i) for i in [uid] + ids], c)
    _add_event(c, chat_id, {"type": "created", "by": uid, "name": name, "names": _names(c, [uid])})
    return chat_id


def add_members(c, uid: int, chat_id: int, ids: list[int]):
    """Anyone in a group can add their own friends."""
    chat, members, _ = _load(uid, chat_id, c, lock=True)
    if chat["kind"] != "group":
        raise ApiError(400, "chat_direct")
    have = {m["id"] for m in members}
    new = [i for i in _check_friends(c, uid, ids) if i not in have]
    if not new:
        return
    if len(have) + len(new) > MAX_GROUP:
        raise ApiError(400, "chat_full", limit=MAX_GROUP)
    db.many("INSERT INTO chat_members (chat_id, user_id, last_read_id) VALUES (%s,%s,%s)",
            [(chat_id, i, chat["last_message_id"]) for i in new], c)
    _add_event(c, chat_id, {"type": "added", "by": uid, "people": new, "names": _names(c, [uid] + new)})


def leave(c, uid: int, chat_id: int):
    """Out of a group (the others see it). The last one out takes the group with them."""
    chat, members, _ = _load(uid, chat_id, c, lock=True)
    if chat["kind"] != "group":
        raise ApiError(400, "chat_direct")
    db.run("DELETE FROM chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, uid), c)
    if len(members) <= 1:
        _drop_chats(c, [chat_id])
    else:
        _add_event(c, chat_id, {"type": "left", "by": uid, "names": _names(c, [uid])})


def edit(c, uid: int, chat_id: int, name: str | None = None, pinned: bool | None = None, push: bool | None = None):
    """Rename a group (everyone sees it), or pin a chat or turn its bell on (only for you)."""
    chat, _, _ = _load(uid, chat_id, c, lock=True)
    if name is not None:
        if chat["kind"] != "group":
            raise ApiError(400, "chat_direct")
        name = clean_name(name)
        if name != chat["name"]:
            db.run("UPDATE chats SET name=%s WHERE id=%s", (name, chat_id), c)
            _add_event(c, chat_id, {"type": "renamed", "by": uid, "name": name, "names": _names(c, [uid])})
    if pinned is not None:
        db.run("UPDATE chat_members SET pinned=%s WHERE chat_id=%s AND user_id=%s", (1 if pinned else 0, chat_id, uid), c)
    if push is not None:
        db.run("UPDATE chat_members SET push=%s WHERE chat_id=%s AND user_id=%s", (1 if push else 0, chat_id, uid), c)


def send(c, uid: int, chat_id: int, body: str) -> dict:
    """A message from you; what you send counts as read. -> the message"""
    chat, _, _ = _load(uid, chat_id, c, lock=True)
    text = clean_body(body)
    if text is None:
        raise ApiError(400, "chat_empty")
    if len(text) > MAX_BODY:
        raise ApiError(400, "chat_long", limit=MAX_BODY)
    mid = db.run("INSERT INTO chat_messages (chat_id, user_id, kind, body) VALUES (%s,%s,'text',%s)",
                 (chat_id, uid, text), c)
    db.run("UPDATE chats SET last_message_id=%s WHERE id=%s", (mid, chat_id), c)
    db.run("UPDATE chat_members SET last_read_id=GREATEST(last_read_id,%s) WHERE chat_id=%s AND user_id=%s",
           (mid, chat_id, uid), c)
    jobs.enqueue("push_chat", {"message_id": mid}, priority=2, max_attempts=4, c=c)
    return message_out(db.one("SELECT * FROM chat_messages WHERE id=%s", (mid,), c))


def take_back(c, uid: int, chat_id: int, message_id: int):
    """Your own message disappears for everyone ("Bericht verwijderd")."""
    _load(uid, chat_id, c)
    n = db.run("UPDATE chat_messages SET deleted_at=UTC_TIMESTAMP(), body=NULL WHERE id=%s AND chat_id=%s "
               "AND user_id=%s AND kind='text' AND deleted_at IS NULL", (message_id, chat_id, uid), c)
    if not n and not db.one("SELECT id FROM chat_messages WHERE id=%s AND chat_id=%s AND user_id=%s AND kind='text'",
                            (message_id, chat_id, uid), c):
        raise ApiError(404, "chat_message_gone")


def mark_read(uid: int, chat_id: int, up_to: int):
    _load(uid, chat_id)
    db.run("UPDATE chat_members SET last_read_id=LEAST(GREATEST(last_read_id,%s),"
           "(SELECT last_message_id FROM chats WHERE id=%s)) WHERE chat_id=%s AND user_id=%s",
           (up_to, chat_id, chat_id, uid))


def report(c, uid: int, message_id: int, reason: str, note: str | None, block: bool) -> dict:
    """"Meld dit bericht" (and, if you want, block the writer). Reporting twice counts once; the writer never knows.
    -> {"reported": True, "blocked": bool}"""
    m = db.one("SELECT * FROM chat_messages WHERE id=%s", (message_id,), c)
    if m is None or m["deleted_at"] is not None:
        raise ApiError(404, "chat_message_gone")
    _load(uid, m["chat_id"], c)
    if m["kind"] != "text" or m["user_id"] is None or m["user_id"] == uid:
        raise ApiError(400, "chat_report_own")
    db.run("INSERT IGNORE INTO chat_reports (message_id, chat_id, reporter_id, author_id, reason, note, snapshot) "
           "VALUES (%s,%s,%s,%s,%s,%s,%s)",
           (message_id, m["chat_id"], uid, m["user_id"], reason, (note or "").strip()[:300] or None, m["body"]), c)
    if block:
        friends.block(c, uid, m["user_id"])
    return {"reported": True, "blocked": block}


def post_event(c, people: list[int], payload: dict, skip: set[int] | frozenset = frozenset()):
    """Something these people did together shows up in every chat they're all in (their one-to-one chat and shared
    groups), e.g. a break they planned. Not in the chats in `skip` (the ones whose request card already says it)."""
    people = sorted(set(people))
    if len(people) < 2:
        return
    ph, args = db.in_list(people)
    for r in db.rows(f"SELECT chat_id FROM chat_members WHERE user_id IN ({ph}) GROUP BY chat_id "
                     f"HAVING COUNT(*)=%s", args + [len(people)], c):
        if r["chat_id"] in skip:
            continue
        _add_event(c, r["chat_id"], {**payload, "people": people, "names": _names(c, people)})


def _group_of(c, uid: int, people: list[int]) -> int | None:
    """A group whose members are exactly `uid` and `people` (the newest if there are several), or None."""
    everyone = sorted({uid, *people})
    ph, args = db.in_list(everyone)
    r = db.one(f"SELECT c.id FROM chats c JOIN chat_members m ON m.chat_id=c.id WHERE c.kind='group' AND c.id IN "
               f"(SELECT chat_id FROM chat_members WHERE user_id=%s) GROUP BY c.id "
               f"HAVING COUNT(*)=%s AND SUM(m.user_id IN ({ph}))=%s ORDER BY MAX(c.last_message_id) DESC LIMIT 1",
               [uid, len(everyone)] + args + [len(everyone)], c)
    return r["id"] if r else None


def post_request(c, uid: int, people: list[int], payload: dict) -> dict[int, int]:
    """A request card from `uid` (the asker) for `people`: in the group that is exactly them (2+ people), else
    in the direct chat with each of them (opened if needed). Counts as read for the asker. No push of its own:
    the request's notification is the push. -> {person: chat id where their card is}"""
    people = sorted(set(people) - {uid})
    group = _group_of(c, uid, people) if len(people) >= 2 else None
    where = {p: group for p in people} if group else {p: open_direct(c, uid, p) for p in people}
    for chat_id in dict.fromkeys(where.values()):
        mid = db.run("INSERT INTO chat_messages (chat_id, user_id, kind, payload) VALUES (%s,%s,'request',%s)",
                     (chat_id, uid, db.js(payload)), c)
        db.run("UPDATE chats SET last_message_id=%s WHERE id=%s", (mid, chat_id), c)
        db.run("UPDATE chat_members SET last_read_id=GREATEST(last_read_id,%s) WHERE chat_id=%s AND user_id=%s",
               (mid, chat_id, uid), c)
    return where


def card_chats(c, kind: str, request_id: int, asker: int, uid: int | None = None) -> list[int]:
    """The chats with the card of this request (newest first); with `uid` only the ones `uid` is in."""
    join = " JOIN chat_members cm ON cm.chat_id=m.chat_id AND cm.user_id=%s" if uid else ""
    return list(dict.fromkeys(r["chat_id"] for r in db.rows(
        f"SELECT m.chat_id FROM chat_messages m{join} WHERE m.user_id=%s AND m.kind='request' "
        f"AND m.payload->>'$.type'=%s AND CAST(m.payload->>'$.request' AS UNSIGNED)=%s ORDER BY m.id DESC",
        ([uid] if uid else []) + [asker, kind, request_id], c)))


def _drop_chats(c, ids: list[int]):
    if not ids:
        return
    ph, args = db.in_list(ids)
    db.run(f"DELETE FROM chat_messages WHERE chat_id IN ({ph})", args, c)
    db.run(f"DELETE FROM chat_members WHERE chat_id IN ({ph})", args, c)
    db.run(f"DELETE FROM chat_reports WHERE chat_id IN ({ph})", args, c)
    db.run(f"DELETE FROM chats WHERE id IN ({ph})", args, c)


def delete_user(c, uid: int):
    """Account deletion: what they wrote, their one-to-one chats, their place in groups (empty groups go too),
    reports by and about them."""
    mine = [r["chat_id"] for r in db.rows("SELECT chat_id FROM chat_members WHERE user_id=%s", (uid,), c)]
    ph, args = db.in_list(mine)
    direct = [r["id"] for r in db.rows(f"SELECT id FROM chats WHERE id IN ({ph}) AND kind='direct'", args, c)]
    _drop_chats(c, direct)
    db.run("DELETE FROM chat_messages WHERE user_id=%s", (uid,), c)
    db.run("DELETE FROM chat_members WHERE user_id=%s", (uid,), c)
    db.run("DELETE FROM chat_reports WHERE reporter_id=%s OR author_id=%s", (uid, uid), c)
    empty = [r["id"] for r in db.rows(f"SELECT c.id FROM chats c LEFT JOIN chat_members m ON m.chat_id=c.id "
                                      f"WHERE c.id IN ({ph}) AND m.user_id IS NULL", args, c)]
    _drop_chats(c, empty)


# ---- Moderation (admin.py) -----------------------------------------------------------

def reports(status: str = "open", limit: int = 100) -> list[dict]:
    """Reports with who reported whom, why, what was written and the three messages before it (context)."""
    where = {"open": "WHERE r.handled_at IS NULL", "handled": "WHERE r.handled_at IS NOT NULL"}.get(status, "")
    rows = db.rows(f"SELECT r.*, a.display_name AS author_name, a.disabled_at AS author_disabled, "
                   f"p.display_name AS reporter_name, msg.deleted_at, msg.removed, "
                   f"(SELECT COUNT(*) FROM chat_reports x WHERE x.author_id=r.author_id) AS author_reports "
                   f"FROM chat_reports r JOIN users a ON a.id=r.author_id JOIN users p ON p.id=r.reporter_id "
                   f"LEFT JOIN chat_messages msg ON msg.id=r.message_id {where} ORDER BY r.id DESC LIMIT %s", (limit,))
    out = []
    for r in rows:
        before = db.rows("SELECT m.id, m.kind, m.body, m.created_at, u.display_name FROM chat_messages m "
                         "LEFT JOIN users u ON u.id=m.user_id WHERE m.chat_id=%s AND m.id < %s AND m.kind='text' "
                         "ORDER BY m.id DESC LIMIT 3", (r["chat_id"], r["message_id"]))
        out.append({
            "id": r["id"], "message_id": r["message_id"], "chat_id": r["chat_id"], "reason": r["reason"],
            "note": r["note"], "text": r["snapshot"], "created_at": r["created_at"].isoformat() + "Z",
            "author": {"id": r["author_id"], "display_name": r["author_name"], "disabled": r["author_disabled"] is not None,
                       "reports": r["author_reports"]},
            "reporter": {"id": r["reporter_id"], "display_name": r["reporter_name"]},
            "message": "removed" if r["removed"] else "deleted" if r["deleted_at"] else "gone" if r["removed"] is None else "visible",
            "context": [{"display_name": b["display_name"], "body": b["body"], "created_at": b["created_at"].isoformat() + "Z"}
                        for b in reversed(before)],
            "handled_at": r["handled_at"].isoformat() + "Z" if r["handled_at"] else None,
            "handled_by": r["handled_by"], "outcome": r["outcome"],
        })
    return out


def resolve(c, report_id: int, outcome: str, actor: str) -> dict:
    """dismissed: nothing wrong. removed: the message disappears for everyone ("Verwijderd door een moderator").
    disabled: removed, and the writer's account is turned off (signed out everywhere). Every open report about the
    same message is closed with it. -> the report row"""
    r = db.one("SELECT * FROM chat_reports WHERE id=%s FOR UPDATE", (report_id,), c)
    if r is None:
        raise ApiError(404, "not_found")
    if outcome in ("removed", "disabled"):
        db.run("UPDATE chat_messages SET deleted_at=COALESCE(deleted_at, UTC_TIMESTAMP()), body=NULL, removed=1 "
               "WHERE id=%s", (r["message_id"],), c)
    if outcome == "disabled":
        db.run("UPDATE users SET disabled_at=UTC_TIMESTAMP() WHERE id=%s AND disabled_at IS NULL", (r["author_id"],), c)
        tokens.revoke_all(r["author_id"], "disabled", c)
    db.run("UPDATE chat_reports SET handled_at=UTC_TIMESTAMP(), handled_by=%s, outcome=%s "
           "WHERE (id=%s OR message_id=%s) AND handled_at IS NULL", (actor, outcome, report_id, r["message_id"]), c)
    return r
