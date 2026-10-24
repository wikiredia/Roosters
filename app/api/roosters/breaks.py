"""Break requests: "Pauze samen?". You tap a break you share with friends and ask them to spend it together:
I come to you, you come to me, or meet at a place, from-until (by default the whole break). Each person asked
answers yes or no, or proposes another time ("Ander uur": a new request the other way). The routes are in
r_breaks.py; the pure parts (no database) are at the top and tested on their own.

Tables: break_requests, break_request_members (migrations/0007_break_requests.sql). Every step leaves an in-app
notification (kind break_request, break_answer, break_counter, break_cancelled; push comes later); a yes
also shows up in the chats the two share (chat.post_event)."""
import datetime as dt

from . import chat, db, friends, logic, notifications, schedule
from .errors import ApiError

# How far ahead you can ask (today = 0): this week and the next
MAX_DAYS_AHEAD = 13
# Shorter than this isn't a break
MIN_MINUTES = 5
MODES = ("i_come", "you_come", "meet")


# ---- Pure parts --------------------------------------------------------------------

def conflict(info: logic.DayInfo, start: int, end: int) -> str | None:
    """Why can't this person between start and end? None = they can. The codes the app explains:
    no_classes (not at school that day, or absent), home (already gone), in_class (a lesson in the way).
    Before the first or after the last lesson is fine: you can still meet then."""
    if not info.present:
        return "no_classes"
    if info.left_at is not None and info.left_at <= start:
        return "home"
    if any(s < end and e > start for s, e in info.busy):
        return "in_class"
    return None


def summarize(responses: list[str]) -> str:
    """Where a request stands: planned (someone said yes), declined (everyone said no), pending."""
    if "accepted" in responses:
        return "planned"
    if responses and all(r == "declined" for r in responses):
        return "declined"
    return "pending"


def flip(mode: str) -> str:
    """A counter-proposal: their "I come to you" is my "you come to me"."""
    return {"i_come": "you_come", "you_come": "i_come"}.get(mode, mode)


def already_asked(existing: list[dict], sender: int, to_ids: list[int], start: int, end: int) -> dict | None:
    """Is there already a request for (part of) this time with (one of) the same people? No asking twice.
    existing: [{id, from_id, start, end, members: {user_id: response}}] (not cancelled).
    -> {"id", "kind": "mine"|"theirs", "state": "pending"|"accepted", "who": [ids]} or None.
    'mine': you asked them already; 'theirs': they asked you. A no doesn't count any more."""
    for e in existing:
        if not (e["start"] < end and e["end"] > start):
            continue
        ms = e["members"]
        if e["from_id"] == sender:
            who = [i for i in to_ids if ms.get(i) in ("pending", "accepted")]
            if who:
                state = "accepted" if any(ms[i] == "accepted" for i in who) else "pending"
                return {"id": e["id"], "kind": "mine", "state": state, "who": who}
        elif e["from_id"] in to_ids and ms.get(sender) in ("pending", "accepted"):
            return {"id": e["id"], "kind": "theirs", "state": ms[sender], "who": [e["from_id"]]}
    return None


# ---- With the database -------------------------------------------------------------

def _now(user: dict) -> tuple[dt.date, int]:
    n = schedule.local_now(user)
    return n.date(), n.hour * 60 + n.minute


def check_day(user: dict, day: dt.date):
    today, _ = _now(user)
    if day < today or day > today + dt.timedelta(days=MAX_DAYS_AHEAD):
        raise ApiError(400, "break_day")


def check_time(user: dict, day: dt.date, start: int, end: int):
    today, now = _now(user)
    if end - start < MIN_MINUTES or (day == today and end <= now):
        raise ApiError(400, "break_time")


def _members(request_ids: list[int], c=None) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {i: [] for i in request_ids}
    if not request_ids:
        return out
    ph, args = db.in_list(request_ids)
    for m in db.rows(f"SELECT m.request_id, m.user_id, m.response, u.display_name, u.avatar_color, u.photo_v "
                     f"FROM break_request_members m JOIN users u ON u.id=m.user_id WHERE m.request_id IN ({ph}) "
                     f"ORDER BY u.display_name", args, c):
        out[m["request_id"]].append(m)
    return out


def _existing(user_id: int, day: dt.date, ignore: int | None = None, c=None) -> list[dict]:
    """Requests on `day` from or to `user_id` (not cancelled), for already_asked."""
    rows = db.rows("SELECT DISTINCT b.id, b.from_id, b.start_min, b.end_min FROM break_requests b "
                   "LEFT JOIN break_request_members m ON m.request_id=b.id "
                   "WHERE b.cancelled_at IS NULL AND b.day=%s AND (b.from_id=%s OR m.user_id=%s)",
                   (day, user_id, user_id), c)
    rows = [r for r in rows if r["id"] != ignore]
    ms = _members([r["id"] for r in rows], c)
    return [{"id": r["id"], "from_id": r["from_id"], "start": r["start_min"], "end": r["end_min"],
             "members": {m["user_id"]: m["response"] for m in ms[r["id"]]}} for r in rows]


def create(c, user: dict, to_ids: list[int], day: dt.date, start: int, end: int, mode: str, place: str | None,
           note: str | None, counter_of: int | None = None) -> int:
    """Checks everyone and stores the request (inside the caller's transaction); tells the people asked.
    Only friends who can see you and aren't hidden; everyone has to be free then (break_busy names who isn't,
    with a code per person); the same people at the same time twice is a 409 break_dup."""
    check_day(user, day)
    check_time(user, day, start, end)
    to_ids = sorted({i for i in to_ids if i != user["id"]})
    if not to_ids:
        raise ApiError(400, "break_people")
    mates = {m["user"]["id"]: m for m in friends.visible_friends_of(user["id"], to_ids)}
    if len(mates) != len(to_ids) or any(m["hidden"] for m in mates.values()):
        raise ApiError(404, "not_friends")
    people = schedule.person_days([user] + [mates[i]["user"] for i in to_ids], day)
    infos = {pid: logic.day_info(p) for pid, p in people.items()}
    mine = conflict(infos[user["id"]], start, end)
    if mine:
        raise ApiError(400, "break_busy_me", reason=mine)
    busy = {i: why for i in to_ids if (why := conflict(infos[i], start, end))}
    if busy:
        raise ApiError(400, "break_busy", people=[{"id": i, "reason": why} for i, why in busy.items()])
    hit = already_asked(_existing(user["id"], day, ignore=counter_of, c=c), user["id"], to_ids, start, end)
    if hit:
        raise ApiError(409, "break_dup", request=hit["id"], kind=hit["kind"], state=hit["state"])
    # A place only when you meet somewhere
    place = ((place or "").strip() or None) if mode == "meet" else None
    rid = db.run("INSERT INTO break_requests (from_id, day, start_min, end_min, mode, place, note, counter_of) "
                 "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                 (user["id"], day, start, end, mode, place, (note or "").strip() or None, counter_of), c)
    db.many("INSERT INTO break_request_members (request_id, user_id) VALUES (%s,%s)", [(rid, i) for i in to_ids], c)
    for i in to_ids:
        notifications.enqueue(i, "break_counter" if counter_of else "break_request", f"break:{rid}",
                              {"request": rid, "from": user["id"], "start": start, "end": end, "mode": mode}, day, c=c)
    return rid


def _load(c, rid: int) -> dict:
    r = db.one("SELECT * FROM break_requests WHERE id=%s FOR UPDATE", (rid,), c)
    if r is None or r["cancelled_at"]:
        raise ApiError(404, "break_gone")
    return r


def _over(user: dict, r: dict) -> bool:
    today, now = _now(user)
    return r["day"] < today or (r["day"] == today and r["end_min"] <= now)


def respond(c, user: dict, rid: int, response: str) -> dict:
    """Yes or no from someone who was asked. A yes can still become a no later (and the other way round)."""
    r = _load(c, rid)
    mine = db.one("SELECT response FROM break_request_members WHERE request_id=%s AND user_id=%s FOR UPDATE",
                  (rid, user["id"]), c)
    if mine is None:
        raise ApiError(404, "break_gone")
    if _over(user, r):
        raise ApiError(400, "break_over")
    if mine["response"] != response:
        db.run("UPDATE break_request_members SET response=%s, responded_at=UTC_TIMESTAMP() "
               "WHERE request_id=%s AND user_id=%s", (response, rid, user["id"]), c)
        stamp = db.utcnow().strftime("%Y%m%d%H%M%S")
        notifications.enqueue(r["from_id"], "break_answer", f"break:{rid}:{user['id']}:{response}:{stamp}",
                              {"request": rid, "from": user["id"], "response": response, "was": mine["response"],
                               "start": r["start_min"], "end": r["end_min"]}, r["day"], c=c)
        if response == "accepted":
            # In the chats they share: "Lotte en Amir pakken samen pauze om 12:30"
            chat.post_event(c, [r["from_id"], user["id"]], {"type": "break_planned", "day": r["day"].isoformat(),
                                                           "start": r["start_min"], "end": r["end_min"],
                                                           "place": r["place"] if r["mode"] == "meet" else None})
    return r


def counter(c, user: dict, rid: int, start: int, end: int, place: str | None, note: str | None) -> int:
    """"Ander uur": a no to this one and a new request back to whoever asked, at the time you propose
    (who walks to whom flipped, same place)."""
    r = _load(c, rid)
    if db.one("SELECT 1 AS x FROM break_request_members WHERE request_id=%s AND user_id=%s", (rid, user["id"]), c) is None:
        raise ApiError(404, "break_gone")
    db.run("UPDATE break_request_members SET response='declined', responded_at=UTC_TIMESTAMP() "
           "WHERE request_id=%s AND user_id=%s", (rid, user["id"]), c)
    return create(c, user, [r["from_id"]], r["day"], start, end, flip(r["mode"]), place if place is not None else r["place"],
                  note, counter_of=rid)


def cancel(c, user: dict, rid: int):
    """The one who asked takes it back; whoever hadn't said no hears about it."""
    r = _load(c, rid)
    if r["from_id"] != user["id"]:
        raise ApiError(404, "break_gone")
    db.run("UPDATE break_requests SET cancelled_at=UTC_TIMESTAMP() WHERE id=%s", (rid,), c)
    for m in _members([rid], c)[rid]:
        if m["response"] != "declined":
            notifications.enqueue(m["user_id"], "break_cancelled", f"break:{rid}:cancelled",
                                  {"request": rid, "from": user["id"], "start": r["start_min"], "end": r["end_min"]},
                                  r["day"], push=m["response"] == "accepted", c=c)


def _person(uid: int, name: str, color: int, photo: int | None = None) -> dict:
    return {"id": uid, "display_name": name, "avatar_color": color, "photo": photo}


def list_for(user: dict, day: dt.date | None = None) -> list[dict]:
    """Requests from and to you that aren't over yet (today and the coming days, or one day), in time order.
    Only with people who are still your friends: after unfriending or blocking they're gone."""
    today, now = _now(user)
    first, last = (day, day) if day else (today, today + dt.timedelta(days=MAX_DAYS_AHEAD))
    rows = db.rows("SELECT DISTINCT b.*, u.display_name AS from_name, u.avatar_color AS from_color, u.photo_v AS from_photo "
                   "FROM break_requests b JOIN users u ON u.id=b.from_id "
                   "LEFT JOIN break_request_members m ON m.request_id=b.id "
                   "WHERE b.cancelled_at IS NULL AND b.day BETWEEN %s AND %s AND (b.from_id=%s OR m.user_id=%s) "
                   "ORDER BY b.day, b.start_min, b.id", (max(first, today), last, user["id"], user["id"]))
    rows = [r for r in rows if not (r["day"] == today and r["end_min"] <= now)]
    known = {m["user"]["id"] for m in friends.visible_friends(user["id"])}
    ms = _members([r["id"] for r in rows])
    out = []
    for r in rows:
        mine = r["from_id"] == user["id"]
        members = [m for m in ms[r["id"]] if m["user_id"] in known or m["user_id"] == user["id"]]
        if (mine and not members) or (not mine and r["from_id"] not in known):
            continue
        out.append({
            "id": r["id"], "day": r["day"].isoformat(), "start": r["start_min"], "end": r["end_min"],
            "mode": r["mode"], "place": r["place"], "note": r["note"], "counter_of": r["counter_of"],
            "from": _person(r["from_id"], r["from_name"], r["from_color"], r["from_photo"]), "mine": mine,
            "members": [{**_person(m["user_id"], m["display_name"], m["avatar_color"], m["photo_v"]), "response": m["response"]}
                        for m in members],
            "my_response": None if mine else next((m["response"] for m in members if m["user_id"] == user["id"]), None),
            "state": summarize([m["response"] for m in members]),
            "now": r["day"] == today and r["start_min"] <= now < r["end_min"],
        })
    return out


def delete_user(c, uid: int):
    """Account deletion: their requests and their answers go too."""
    db.run("DELETE m FROM break_request_members m JOIN break_requests b ON b.id=m.request_id WHERE b.from_id=%s",
           (uid,), c)
    db.run("DELETE FROM break_requests WHERE from_id=%s", (uid,), c)
    db.run("DELETE FROM break_request_members WHERE user_id=%s", (uid,), c)
