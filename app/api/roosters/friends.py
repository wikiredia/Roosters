"""Who may see whom. Friendship is mutual (two rows); each side chooses what the other sees
(full timetable or only free/busy); ghost mode hides you for a while; blocking ends everything."""
from . import config, db
from .errors import ApiError


def visible_friends(user_id: int) -> list[dict]:
    """My friends, with what each of them shows me. -> [{user, visibility, my_visibility, hidden}]"""
    now = db.utcnow()
    rows = db.rows(
        "SELECT u.*, f.visibility AS their_visibility, mine.visibility AS my_visibility FROM friendships f "
        "JOIN users u ON u.id=f.user_id JOIN friendships mine ON mine.user_id=%s AND mine.friend_id=f.user_id "
        "WHERE f.friend_id=%s ORDER BY u.display_name", (user_id, user_id))
    return [{"user": r, "visibility": r["their_visibility"], "my_visibility": r["my_visibility"],
             "hidden": bool(r["ghost_until"] and r["ghost_until"] > now)} for r in rows]


def friend_out(m: dict) -> dict:
    u = m["user"]
    return {"id": u["id"], "display_name": u["display_name"], "avatar_color": u["avatar_color"],
            "school_id": u["school_id"], "campus_id": u["campus_id"], "visibility": m["visibility"],
            "my_visibility": m["my_visibility"], "hidden": m["hidden"]}


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
