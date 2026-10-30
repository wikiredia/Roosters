"""Skip questions: "Volg je Python?". In Vergelijken you drag one of a friend's classes into the bin: that asks them
whether they'd skip it, because then the two of you share a break (`minutes`, worked out when asking). It's the
other way round from your own skips (r_me.skip): their timetable stays theirs. While it's open only you see the class
as skipped (the app draws it so from `list_for`); they see nothing change until they say yes, and then it's a skip
of their own (skipped_lessons), so both phones show the longer break. No, or you taking it back: nothing changed.

Like an access request, it's a card in your direct chat (chat.post_request, `cards`) with an in-app notification and
a push (kind skip_request, and skip_answer back to you; the payload names the chat). The course is theirs to tell:
you only get it back (card, list) when they show you their courses (visibility full or norooms). After unfriending
or blocking the questions are gone for both. The routes are in r_friends.py.

Table: skip_requests (migrations/0017_skip_requests.sql)."""
import datetime as dt

from . import chat, db, friends, logic, notifications, schedule
from .errors import ApiError


def _person(uid: int, name: str, color: int, photo: int | None) -> dict:
    return {"id": uid, "display_name": name, "avatar_color": color, "photo": photo}


_SELECT = ("SELECT r.*, a.display_name AS from_name, a.avatar_color AS from_color, a.photo_v AS from_photo, "
           "b.display_name AS to_name, b.avatar_color AS to_color, b.photo_v AS to_photo, "
           "f.visibility AS shows FROM skip_requests r "
           "JOIN users a ON a.id=r.from_id JOIN users b ON b.id=r.to_id "
           "LEFT JOIN friendships f ON f.user_id=r.to_id AND f.friend_id=r.from_id ")


def _out(uid: int, r: dict) -> dict:
    mine = r["from_id"] == uid
    # Their course only for whoever may see it: the one asked, or an asker they show their courses to
    course = r["course"] if not mine or r["shows"] in ("full", "norooms") else None
    return {"type": "skip", "id": r["id"], "from": _person(r["from_id"], r["from_name"], r["from_color"], r["from_photo"]),
            "to": _person(r["to_id"], r["to_name"], r["to_color"], r["to_photo"]), "mine": mine,
            "day": r["day"].isoformat(), "start": r["start_min"], "end": r["end_min"], "course": course,
            "minutes": r["minutes"], "status": r["status"], "created_at": r["created_at"].isoformat() + "Z"}


def cards(uid: int, ids: list[int]) -> dict[int, dict | None]:
    """What the cards in the chat show `uid` (chat.with_requests): the question as it is now, or None when it isn't
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


def one(uid: int, rid: int) -> dict | None:
    return cards(uid, [rid]).get(rid)


def open_ids(uid: int) -> list[int]:
    """Pending questions from or to `uid`, between friends, not over yet (chat.list_for's `requests`)."""
    today = dt.date.today() - dt.timedelta(days=1)
    return [r["id"] for r in db.rows(
        "SELECT r.id FROM skip_requests r JOIN friendships f ON f.user_id=%s "
        "AND f.friend_id=IF(r.from_id=%s, r.to_id, r.from_id) WHERE r.status='pending' AND r.day>=%s "
        "AND (r.from_id=%s OR r.to_id=%s)", (uid, uid, today, uid, uid))]


def list_for(user: dict) -> list[dict]:
    """Your open questions, asked and to answer, from today on, between friends (GET /skip-requests): the app draws
    the classes you asked about as skipped in Vergelijken, only for you."""
    uid = user["id"]
    today = schedule.local_now(user).date()
    rows = db.rows(_SELECT + "WHERE r.status='pending' AND r.day>=%s AND (r.from_id=%s OR r.to_id=%s) "
                   "ORDER BY r.day, r.start_min", (today, uid, uid))
    mates = {r["friend_id"] for r in db.rows("SELECT friend_id FROM friendships WHERE user_id=%s", (uid,))}
    return [_out(uid, r) for r in rows if (r["to_id"] if r["from_id"] == uid else r["from_id"]) in mates]


def _in_span(ls: list[dict], start: int, end: int) -> list[dict]:
    """The lessons that take place inside the span (the block the app drew, a double period as one)."""
    return [l for l in ls if schedule.takes_place(l) and start <= l["start_min"] and l["end_min"] <= end]


def shared_minutes(me: dict, friend: dict, day: dt.date, start: int, end: int) -> int:
    """How long `me` and `friend` would share a break that day if `friend` skipped what's in the span: the shared
    breaks (logic.pair_breaks, same rules as the yellow blocks) that touch the span, added up."""
    people = schedule.person_days([me, friend], day)
    them = people[friend["id"]]
    them.lessons = [(s, e) for s, e in them.lessons if not (start <= s and e <= end)]
    infos = {pid: logic.day_info(p) for pid, p in people.items()}
    found = logic.pair_breaks(people[me["id"]], them, infos[me["id"]], infos[friend["id"]])
    return sum(e - s for s, e in found if s < end and start < e)


def ask(c, user: dict, friend_id: int, day: dt.date, start: int, end: int) -> tuple[int, int]:
    """Ask a friend whether they'd skip what they have from `start` to `end` on `day`. 404 not_friends (or hidden);
    400 skip_day (over), skip_unknown (nothing of theirs takes place there), skip_ask_nothing (even then no shared
    break); 409 skip_ask_dup when you already asked about that time. -> (request id, chat with the card)"""
    uid = user["id"]
    m = friends.friendship(uid, friend_id)
    if m is None or m["hidden"] or friends.blocked_between(uid, friend_id, c):
        raise ApiError(404, "not_friends")
    them = m["user"]
    if day < schedule.local_now(them).date():
        raise ApiError(400, "skip_day")
    hit = _in_span(schedule.lessons([friend_id], day, day)[friend_id], start, end)
    if not hit:
        raise ApiError(404, "skip_unknown")
    if db.one("SELECT id FROM skip_requests WHERE from_id=%s AND to_id=%s AND day=%s AND status='pending' "
              "AND start_min<%s AND end_min>%s", (uid, friend_id, day, end, start), c):
        raise ApiError(409, "skip_ask_dup")
    minutes = shared_minutes(user, them, day, start, end)
    if minutes <= 0:
        raise ApiError(400, "skip_ask_nothing")
    course = " + ".join(dict.fromkeys(l["course"] for l in hit))[:200]
    rid = db.run("INSERT INTO skip_requests (from_id, to_id, day, start_min, end_min, course, minutes) "
                 "VALUES (%s,%s,%s,%s,%s,%s,%s)", (uid, friend_id, day, start, end, course, minutes), c)
    chat_id = chat.post_request(c, uid, [friend_id], {"type": "skip", "request": rid})[friend_id]
    notifications.enqueue(friend_id, "skip_request", f"skip:{rid}",
                          {"request": rid, "from": uid, "course": course, "start": start, "end": end,
                           "minutes": minutes, "chat": chat_id}, day=day, c=c)
    return rid, chat_id


def answer(c, uid: int, rid: int, action: str):
    """accept / decline by the one asked, cancel by the one who asked; only while it's open, not over and you're
    still friends (else 404 not_found). Accept skips their classes in the span (a skipped_lessons row per course, as
    if they dragged it into the bin themselves)."""
    r = db.one("SELECT * FROM skip_requests WHERE id=%s AND status='pending' FOR UPDATE", (rid,), c)
    mine = r is not None and ((action in ("accept", "decline") and r["to_id"] == uid) or
                              (action == "cancel" and r["from_id"] == uid))
    if not mine or not db.one("SELECT 1 AS x FROM friendships WHERE user_id=%s AND friend_id=%s",
                              (r["to_id"], r["from_id"]), c):
        raise ApiError(404, "not_found")
    them = db.one("SELECT * FROM users WHERE id=%s", (r["to_id"],), c)
    if r["day"] < schedule.local_now(them).date():
        raise ApiError(404, "not_found")
    status = {"accept": "accepted", "decline": "declined", "cancel": "cancelled"}[action]
    db.run("UPDATE skip_requests SET status=%s, decided_at=UTC_TIMESTAMP() WHERE id=%s", (status, rid), c)
    if action == "accept":
        spans: dict[str, list[int]] = {}
        for l in _in_span(schedule.lessons([r["to_id"]], r["day"], r["day"])[r["to_id"]], r["start_min"], r["end_min"]):
            s = spans.setdefault(l["course"], [l["start_min"], l["end_min"]])
            s[0], s[1] = min(s[0], l["start_min"]), max(s[1], l["end_min"])
        for course, (s, e) in spans.items():
            db.run("INSERT INTO skipped_lessons (user_id, day, course, start_min, end_min) VALUES (%s,%s,%s,%s,%s) "
                   "ON DUPLICATE KEY UPDATE end_min=GREATEST(end_min, VALUES(end_min))",
                   (r["to_id"], r["day"], course, s, e), c)
    if action != "cancel":
        here = chat.card_chats(c, "skip", rid, r["from_id"], r["from_id"])
        notifications.enqueue(r["from_id"], "skip_answer", f"skip:{rid}:{status}",
                              {"request": rid, "from": uid, "response": status, "start": r["start_min"],
                               "end": r["end_min"], "minutes": r["minutes"], "chat": here[0] if here else None},
                              day=r["day"], c=c)


def export(uid: int) -> list[dict]:
    return db.rows("SELECT from_id, to_id, day, start_min, end_min, course, minutes, status, created_at, decided_at "
                   "FROM skip_requests WHERE from_id=%s OR to_id=%s", (uid, uid))


def delete_user(c, uid: int):
    """Account deletion: asked by them or to them."""
    db.run("DELETE FROM skip_requests WHERE from_id=%s OR to_id=%s", (uid, uid), c)
