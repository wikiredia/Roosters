"""Access requests: "Mag ik je rooster zien?". What you show a friend stays your own setting (friendships.visibility,
r_friends.edit_friend); this is the other way round: you ask a friend to show you more of *their* timetable (full,
or everything but the rooms). They accept (their visibility toward you becomes what you asked) or decline; you can
take it back while it's open. The routes are in r_friends.py.

Like a break request, it is a card in your direct chat with them (chat.post_request) that always shows how it
stands (`cards`), with an in-app notification and a push (kind access_request, and access_answer back to you; the
payload names the chat with the card). After unfriending or blocking the requests are gone for both (`cards` and
`open_ids` only show them between friends).

Table: access_requests (migrations/0016_request_cards.sql)."""
from . import chat, db, friends, notifications
from .errors import ApiError

# What a friend can show you, from little to much
LEVELS = ("freebusy", "norooms", "full")


def has_enough(current: str, wanted: str) -> bool:
    """They already show you `wanted` or more."""
    return LEVELS.index(current) >= LEVELS.index(wanted)


def _person(uid: int, name: str, color: int, photo: int | None) -> dict:
    return {"id": uid, "display_name": name, "avatar_color": color, "photo": photo}


_SELECT = ("SELECT r.*, a.display_name AS from_name, a.avatar_color AS from_color, a.photo_v AS from_photo, "
           "b.display_name AS to_name, b.avatar_color AS to_color, b.photo_v AS to_photo FROM access_requests r "
           "JOIN users a ON a.id=r.from_id JOIN users b ON b.id=r.to_id ")


def _out(uid: int, r: dict) -> dict:
    return {"type": "access", "id": r["id"], "from": _person(r["from_id"], r["from_name"], r["from_color"], r["from_photo"]),
            "to": _person(r["to_id"], r["to_name"], r["to_color"], r["to_photo"]), "mine": r["from_id"] == uid,
            "visibility": r["visibility"], "status": r["status"], "created_at": r["created_at"].isoformat() + "Z"}


def cards(uid: int, ids: list[int]) -> dict[int, dict | None]:
    """What the cards in the chat show `uid` (chat.with_requests): the request as it is now, or None when it isn't
    theirs or the two aren't friends any more."""
    ids = list(dict.fromkeys(ids))
    if not ids:
        return {}
    ph, args = db.in_list(ids)
    mates = {r["friend_id"] for r in db.rows("SELECT friend_id FROM friendships WHERE user_id=%s", (uid,))}
    found = {}
    for r in db.rows(_SELECT + f"WHERE r.id IN ({ph}) AND (r.from_id=%s OR r.to_id=%s)", args + [uid, uid]):
        other = r["to_id"] if r["from_id"] == uid else r["from_id"]
        if other in mates:
            found[r["id"]] = _out(uid, r)
    return {i: found.get(i) for i in ids}


def open_ids(uid: int) -> list[int]:
    """Pending requests from or to `uid`, between friends (chat.list_for's `requests`)."""
    return [r["id"] for r in db.rows(
        "SELECT r.id FROM access_requests r JOIN friendships f ON f.user_id=%s "
        "AND f.friend_id=IF(r.from_id=%s, r.to_id, r.from_id) WHERE r.status='pending' AND (r.from_id=%s OR r.to_id=%s)",
        (uid, uid, uid, uid))]


def one(uid: int, rid: int) -> dict | None:
    return cards(uid, [rid]).get(rid)


def ask(c, uid: int, friend_id: int, visibility: str) -> tuple[int, int]:
    """Ask a friend to show you `visibility`. 404 not_friends; 400 access_has when they already show you that much
    or more; 409 access_dup when one of yours to them is still open. -> (request id, chat with the card)"""
    m = db.one("SELECT visibility FROM friendships WHERE user_id=%s AND friend_id=%s FOR UPDATE", (friend_id, uid), c)
    if m is None or friend_id == uid or friends.blocked_between(uid, friend_id, c):
        raise ApiError(404, "not_friends")
    if has_enough(m["visibility"], visibility):
        raise ApiError(400, "access_has", visibility=m["visibility"])
    if db.one("SELECT id FROM access_requests WHERE from_id=%s AND to_id=%s AND status='pending'", (uid, friend_id), c):
        raise ApiError(409, "access_dup")
    rid = db.run("INSERT INTO access_requests (from_id, to_id, visibility) VALUES (%s,%s,%s)",
                 (uid, friend_id, visibility), c)
    chat_id = chat.post_request(c, uid, [friend_id], {"type": "access", "request": rid})[friend_id]
    notifications.enqueue(friend_id, "access_request", f"access:{rid}",
                          {"request": rid, "from": uid, "visibility": visibility, "chat": chat_id}, c=c)
    return rid, chat_id


def answer(c, uid: int, rid: int, action: str):
    """accept / decline by the one asked, cancel by the one who asked; only while it's open and you're still
    friends (else 404 not_found). Accept sets what they show the asker to what was asked."""
    r = db.one("SELECT * FROM access_requests WHERE id=%s AND status='pending' FOR UPDATE", (rid,), c)
    mine = r is not None and ((action in ("accept", "decline") and r["to_id"] == uid) or
                              (action == "cancel" and r["from_id"] == uid))
    if not mine or not db.one("SELECT 1 AS x FROM friendships WHERE user_id=%s AND friend_id=%s",
                              (r["to_id"], r["from_id"]), c):
        raise ApiError(404, "not_found")
    status = {"accept": "accepted", "decline": "declined", "cancel": "cancelled"}[action]
    db.run("UPDATE access_requests SET status=%s, decided_at=UTC_TIMESTAMP() WHERE id=%s", (status, rid), c)
    if action == "accept":
        db.run("UPDATE friendships SET visibility=%s WHERE user_id=%s AND friend_id=%s",
               (r["visibility"], r["to_id"], r["from_id"]), c)
    if action != "cancel":
        here = chat.card_chats(c, "access", rid, r["from_id"], r["from_id"])
        notifications.enqueue(r["from_id"], "access_answer", f"access:{rid}:{status}",
                              {"request": rid, "from": uid, "response": status, "visibility": r["visibility"],
                               "chat": here[0] if here else None}, c=c)


def export(uid: int) -> list[dict]:
    return db.rows("SELECT from_id, to_id, visibility, status, created_at, decided_at FROM access_requests "
                   "WHERE from_id=%s OR to_id=%s", (uid, uid))


def delete_user(c, uid: int):
    """Account deletion: asked by them or to them."""
    db.run("DELETE FROM access_requests WHERE from_id=%s OR to_id=%s", (uid, uid), c)
