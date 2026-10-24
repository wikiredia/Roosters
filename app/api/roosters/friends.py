"""Who may see whom. Friendship is mutual (two rows); each side chooses what the other sees
(full timetable or only free/busy) and may pin the other (only for itself); ghost mode hides you for a while;
blocking ends everything."""
from . import config, db
from .errors import ApiError


def visible_friends(user_id: int) -> list[dict]:
    """My friends, with what each of them shows me, pinned ones first, then by name.
    -> [{user, visibility, my_visibility, pinned, hidden}]"""
    now = db.utcnow()
    rows = db.rows(
        "SELECT u.*, f.visibility AS their_visibility, mine.visibility AS my_visibility, mine.pinned AS my_pinned "
        "FROM friendships f JOIN users u ON u.id=f.user_id "
        "JOIN friendships mine ON mine.user_id=%s AND mine.friend_id=f.user_id "
        "WHERE f.friend_id=%s ORDER BY mine.pinned DESC, u.display_name, u.id", (user_id, user_id))
    return [{"user": r, "visibility": r["their_visibility"], "my_visibility": r["my_visibility"],
             "pinned": bool(r["my_pinned"]), "hidden": bool(r["ghost_until"] and r["ghost_until"] > now)} for r in rows]


def friend_out(m: dict) -> dict:
    u = m["user"]
    return {"id": u["id"], "display_name": u["display_name"], "avatar_color": u["avatar_color"],
            "photo": u.get("photo_v"), "school_id": u["school_id"], "campus_id": u["campus_id"], "visibility": m["visibility"],
            "my_visibility": m["my_visibility"], "pinned": m["pinned"], "hidden": m["hidden"]}


def set_pinned(c, me: int, friend: int, pinned: bool):
    """Pin a friend (or not): only on my own row of the friendship, so they never learn it."""
    db.run("UPDATE friendships SET pinned=%s WHERE user_id=%s AND friend_id=%s", (1 if pinned else 0, me, friend), c)


def friendship(me: int, other: int) -> dict | None:
    """What `other` shows me, or None when we're not friends."""
    return next(iter(visible_friends_of(me, [other])), None)


def visible_friends_of(me: int, others: list[int]) -> list[dict]:
    if not others:
        return []
    wanted = set(others)
    return [m for m in visible_friends(me) if m["user"]["id"] in wanted]


def blocked_between(a: int, b: int, c=None) -> bool:
    return bool(db.one("SELECT 1 AS x FROM blocks WHERE (user_id=%s AND blocked_id=%s) OR (user_id=%s AND blocked_id=%s)",
                       (a, b, b, a), c))


def count(user_id: int, c=None) -> int:
    return db.one("SELECT COUNT(*) AS n FROM friendships WHERE user_id=%s", (user_id,), c)["n"]


def connect(c, a: int, b: int):
    """Makes a and b friends (inside a transaction). Closes open requests between them."""
    if a == b:
        raise ApiError(400, "invite_self")
    if blocked_between(a, b, c):
        raise ApiError(403, "blocked")
    if count(a, c) >= config.MAX_FRIENDS or count(b, c) >= config.MAX_FRIENDS:
        raise ApiError(400, "friend_limit")
    db.run("INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (%s,%s),(%s,%s)", (a, b, b, a), c)
    db.run("UPDATE friend_requests SET status='accepted', decided_at=UTC_TIMESTAMP() WHERE status='pending' "
           "AND ((from_id=%s AND to_id=%s) OR (from_id=%s AND to_id=%s))", (a, b, b, a), c)


def disconnect(c, a: int, b: int):
    db.run("DELETE FROM friendships WHERE (user_id=%s AND friend_id=%s) OR (user_id=%s AND friend_id=%s)",
           (a, b, b, a), c)


def block(c, a: int, b: int):
    """a blocks b (inside a transaction): the friendship and open requests end, b can't send new ones.
    b isn't told."""
    db.run("INSERT IGNORE INTO blocks (user_id, blocked_id) VALUES (%s,%s)", (a, b), c)
    disconnect(c, a, b)
    db.run("UPDATE friend_requests SET status='cancelled', decided_at=UTC_TIMESTAMP() WHERE status='pending' "
           "AND ((from_id=%s AND to_id=%s) OR (from_id=%s AND to_id=%s))", (a, b, b, a), c)


def blocked_by(user_id: int, c=None) -> set[int]:
    """Everyone `user_id` blocked."""
    return {r["blocked_id"] for r in db.rows("SELECT blocked_id FROM blocks WHERE user_id=%s", (user_id,), c)}


def may_see_photo(me: int, other: int) -> bool:
    """Your own photo, your friends', the people in a chat with you and whoever asked you (or you asked) to be
    friends: everyone whose name you can see in the app. Never across a block."""
    if me == other:
        return True
    if blocked_between(me, other):
        return False
    return bool(db.one(
        "SELECT 1 AS x FROM friendships WHERE user_id=%s AND friend_id=%s "
        "UNION SELECT 1 FROM chat_members a JOIN chat_members b ON b.chat_id=a.chat_id AND b.user_id=%s WHERE a.user_id=%s "
        "UNION SELECT 1 FROM friend_requests WHERE (from_id=%s AND to_id=%s) OR (from_id=%s AND to_id=%s) LIMIT 1",
        (me, other, other, me, me, other, other, me)))
