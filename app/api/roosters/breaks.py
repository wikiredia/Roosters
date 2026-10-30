"""Break requests: "Pauze samen?". You tap a break you share with friends and ask them to spend it together:
I come to you, you come to me, or meet at a place, from-until (by default the whole break). Each person asked
answers yes or no, or proposes another time ("Ander uur": a new request the other way). The routes are in
r_breaks.py; the pure parts (no database) are at the top and tested on their own.

Every request is a card in the chat (chat.post_request): in the direct chat with each person asked, or once in the
group that is exactly them. `cards` is what such a card shows (also when it's over or cancelled).

Tables: break_requests, break_request_members (migrations/0007_break_requests.sql). Every step leaves an in-app
notification with a push (kind break_request, break_answer, break_counter, break_cancelled; its payload names the
chat with the card for whoever gets it, so the push opens that chat); a yes also shows up in the other chats the
two share (chat.post_event), not in the ones with the card.

A card also says whether the break can still happen (`possible`, with `blocked` when the school is the reason:
`feasibility`). `shared_with` gives the breaks you share with one friend this school week (the "Pauze samen?"
suggestion in your one-to-one chat), `usual` who you usually take a break with (the coffee zone in the Rooster tab)."""
import datetime as dt
from collections import Counter, defaultdict

from . import chat, db, friends, logic, notifications, schedule
from .errors import ApiError

# How far ahead you can ask (today = 0): this week and the next
MAX_DAYS_AHEAD = 13
# Shorter than this isn't a break
MIN_MINUTES = 5
MODES = ("i_come", "you_come", "meet")
# Lesson states the school sets (schedule / untis.py), and what a card says when such a lesson is in the way
SCHOOL_CHANGES = {"extra": "new_lesson", "changed": "moved"}
# "Meestal ga je met": how far back, how many people, and filled up with pinned friends to this many
USUAL_WEEKS = 8
USUAL_MAX = 6
USUAL_MIN = 3


# ---- Pure parts --------------------------------------------------------------------

def conflict(info: logic.DayInfo, start: int, end: int) -> str | None:
    """Why can't this person between start and end? None = they can. The codes the app explains:
    no_classes (not at school that day, or absent), home (already gone), in_class (a lesson in the way),
    busy (said "Ik ben bezig" for their breaks today, and this is during one).
    Before the first or after the last lesson is fine: you can still meet then."""
    if not info.present:
        return "no_classes"
    if info.left_at is not None and info.left_at <= start:
        return "home"
    if any(s < end and e > start for s, e in info.busy):
        return "in_class"
    if info.breaks_busy and any(s < end and e > start for s, e in logic.gaps(info.busy)):
        return "busy"
    return None


def school_change(lessons: list[dict], start: int, end: int) -> str | None:
    """Is a lesson between start and end in the way because the school changed the timetable? 'new_lesson'
    (an extra lesson) or 'moved' (one that changed); None when nothing is in the way, or when one of the lessons in
    the way is a normal one (a skip undone: that's in the person's own hands)."""
    hit = [SCHOOL_CHANGES.get(l["state"]) for l in lessons
           if schedule.takes_place(l) and l["start_min"] < end and l["end_min"] > start]
    if not hit or None in hit:
        return None
    return "new_lesson" if "new_lesson" in hit else "moved"


def school_week(today: dt.date) -> tuple[dt.date, dt.date]:
    """From today to Friday; on Saturday and Sunday the coming Monday to Friday."""
    if today.weekday() >= 5:
        monday = today + dt.timedelta(days=7 - today.weekday())
        return monday, monday + dt.timedelta(days=4)
    return today, today + dt.timedelta(days=4 - today.weekday())


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
           note: str | None, counter_of: int | None = None) -> tuple[int, list[int]]:
    """Checks everyone and stores the request (inside the caller's transaction); puts its card in the chat and tells
    the people asked. Only friends who can see you and aren't hidden; everyone has to be free then (break_busy
    names who isn't, with a code per person); the same people at the same time twice is a 409 break_dup.
    -> (request id, the chats the card went to)"""
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
    chats = chat.post_request(c, user["id"], to_ids, {"type": "break", "request": rid})
    for i in to_ids:
        notifications.enqueue(i, "break_counter" if counter_of else "break_request", f"break:{rid}",
                              {"request": rid, "from": user["id"], "start": start, "end": end, "mode": mode,
                               "chat": chats[i]}, day, c=c)
    return rid, list(dict.fromkeys(chats.values()))


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
        cards = chat.card_chats(c, "break", rid, r["from_id"])
        here = chat.card_chats(c, "break", rid, r["from_id"], user["id"])
        notifications.enqueue(r["from_id"], "break_answer", f"break:{rid}:{user['id']}:{response}:{stamp}",
                              {"request": rid, "from": user["id"], "response": response, "was": mine["response"],
                               "start": r["start_min"], "end": r["end_min"], "chat": here[0] if here else None},
                              r["day"], c=c)
        if response == "accepted":
            # In the other chats they share: "Lotte en Amir pakken samen pauze om 12:30" (the card says it already)
            chat.post_event(c, [r["from_id"], user["id"]], {"type": "break_planned", "day": r["day"].isoformat(),
                                                           "start": r["start_min"], "end": r["end_min"],
                                                           "place": r["place"] if r["mode"] == "meet" else None},
                            skip=set(cards))
    return r


def counter(c, user: dict, rid: int, start: int, end: int, place: str | None, note: str | None) -> tuple[int, list[int]]:
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
            here = chat.card_chats(c, "break", rid, user["id"], m["user_id"])
            notifications.enqueue(m["user_id"], "break_cancelled", f"break:{rid}:cancelled",
                                  {"request": rid, "from": user["id"], "start": r["start_min"], "end": r["end_min"],
                                   "chat": here[0] if here else None},
                                  r["day"], push=m["response"] == "accepted", c=c)


def _person(uid: int, name: str, color: int, photo: int | None = None) -> dict:
    return {"id": uid, "display_name": name, "avatar_color": color, "photo": photo}


_SELECT = ("SELECT DISTINCT b.*, u.display_name AS from_name, u.avatar_color AS from_color, u.photo_v AS from_photo "
           "FROM break_requests b JOIN users u ON u.id=b.from_id LEFT JOIN break_request_members m ON m.request_id=b.id ")


def _out(user: dict, rows: list[dict]) -> list[dict]:
    """The requests as `user` sees them. Only with people who are still your friends: after unfriending or blocking
    they're gone (left out)."""
    today, now = _now(user)
    known = {m["user"]["id"] for m in friends.visible_friends(user["id"])}
    ms = _members([r["id"] for r in rows])
    out = []
    for r in rows:
        mine = r["from_id"] == user["id"]
        if not mine and user["id"] not in {m["user_id"] for m in ms[r["id"]]}:
            continue
        members = [m for m in ms[r["id"]] if m["user_id"] in known or m["user_id"] == user["id"]]
        if (mine and not members) or (not mine and r["from_id"] not in known):
            continue
        over = r["day"] < today or (r["day"] == today and r["end_min"] <= now)
        out.append({
            "id": r["id"], "day": r["day"].isoformat(), "start": r["start_min"], "end": r["end_min"],
            "mode": r["mode"], "place": r["place"], "note": r["note"], "counter_of": r["counter_of"],
            "from": _person(r["from_id"], r["from_name"], r["from_color"], r["from_photo"]), "mine": mine,
            "members": [{**_person(m["user_id"], m["display_name"], m["avatar_color"], m["photo_v"]), "response": m["response"]}
                        for m in members],
            "my_response": None if mine else next((m["response"] for m in members if m["user_id"] == user["id"]), None),
            "state": "cancelled" if r["cancelled_at"] else summarize([m["response"] for m in members]),
            "now": r["day"] == today and r["start_min"] <= now < r["end_min"],
            "over": over,
        })
    return out


def list_for(user: dict, day: dt.date | None = None) -> list[dict]:
    """Requests from and to you that aren't over yet (today and the coming days, or one day), in time order.
    Not the cancelled ones; only with people who are still your friends."""
    today, now = _now(user)
    first, last = (day, day) if day else (today, today + dt.timedelta(days=MAX_DAYS_AHEAD))
    rows = db.rows(_SELECT + "WHERE b.cancelled_at IS NULL AND b.day BETWEEN %s AND %s AND (b.from_id=%s OR m.user_id=%s) "
                   "ORDER BY b.day, b.start_min, b.id", (max(first, today), last, user["id"], user["id"]))
    return [b for b in _out(user, rows) if not b["over"]]


def cards(user: dict, ids: list[int]) -> dict[int, dict | None]:
    """What the request cards in the chat show `user` (chat.with_requests): each request as it is now, also when
    it's over (`over`) or taken back (state 'cancelled'). None: not for them (any more), e.g. not friends now."""
    ids = list(dict.fromkeys(ids))
    if not ids:
        return {}
    ph, args = db.in_list(ids)
    found = {b["id"]: {"type": "break", **b} for b in _out(user, db.rows(_SELECT + f"WHERE b.id IN ({ph})", args))}
    feasibility(list(found.values()))
    return {i: found.get(i) for i in ids}


def feasibility(items: list[dict]):
    """Adds `possible` and `blocked` to these requests (as _out gives them): can the break still happen? Only asked
    for requests that are still on (not over, cancelled or declined); the others are `possible` as they are.
    Not possible: the asker or someone asked who didn't say no isn't free for the whole time any more (`conflict`
    on that day). `blocked` names the reason only when it's the school's doing (`school_change` of everyone in the
    way); else None (a skip undone, went home, busy, absent: the app gives no reason)."""
    for b in items:
        b["possible"], b["blocked"] = True, None
    todo = [b for b in items if not b["over"] and b["state"] in ("pending", "planned")]
    if not todo:
        return
    ph, args = db.in_list([b["id"] for b in todo])
    who: dict[int, set[int]] = defaultdict(set)
    for r in db.rows(f"SELECT request_id, user_id FROM break_request_members WHERE request_id IN ({ph}) "
                     f"AND response <> 'declined'", args):
        who[r["request_id"]].add(r["user_id"])
    by_day: dict[str, list[dict]] = defaultdict(list)
    for b in todo:
        who[b["id"]].add(b["from"]["id"])
        by_day[b["day"]].append(b)
    for day_s, bs in by_day.items():
        day = dt.date.fromisoformat(day_s)
        ids = sorted({i for b in bs for i in who[b["id"]]})
        uph, uargs = db.in_list(ids)
        users = db.rows(f"SELECT id, display_name, campus_id FROM users WHERE id IN ({uph})", uargs)
        infos = {pid: logic.day_info(p) for pid, p in schedule.person_days(users, day).items()}
        for b in bs:
            why = {i: r for i in who[b["id"]] if i in infos and (r := conflict(infos[i], b["start"], b["end"]))}
            if not why:
                continue
            b["possible"] = False
            if set(why.values()) == {"in_class"}:
                ls = schedule.lessons(why, day, day)
                reasons = [school_change(ls[i], b["start"], b["end"]) for i in why]
                if None not in reasons:
                    b["blocked"] = "new_lesson" if "new_lesson" in reasons else "moved"


def shared_with(user: dict, other: int) -> list[dict]:
    """The breaks you share with this friend from now to the end of this school week (on a weekend: the coming
    week), like the Rooster tab's `together` (r_me.together_days): only while you're friends and they aren't hidden
    (ghost). `asked`: a request between you two (either way, not taken back) for (part of) that break exists.
    -> [{day, start, end, asked}]"""
    m = friends.friendship(user["id"], other)
    if m is None or m["hidden"]:
        return []
    n = schedule.local_now(user)
    today, now = n.date(), n.hour * 60 + n.minute
    first, last = school_week(today)
    asked = db.rows("SELECT DISTINCT b.day, b.start_min, b.end_min FROM break_requests b "
                    "JOIN break_request_members m ON m.request_id=b.id WHERE b.cancelled_at IS NULL "
                    "AND b.day BETWEEN %s AND %s AND ((b.from_id=%s AND m.user_id=%s) OR (b.from_id=%s AND m.user_id=%s))",
                    (first, last, user["id"], other, other, user["id"]))
    out = []
    d = first
    while d <= last:
        people = schedule.person_days([user, m["user"]], d)
        infos = {pid: logic.day_info(p) for pid, p in people.items()}
        for p in logic.partners(people[user["id"]], people, infos, after=now if d == today else 0):
            out.append({"day": d.isoformat(), "start": p["start"], "end": p["end"],
                        "asked": any(a["day"] == d and a["start_min"] < p["end"] and a["end_min"] > p["start"]
                                     for a in asked)})
        d += dt.timedelta(days=1)
    return out


def usual(user: dict) -> list[dict]:
    """"Meestal ga je met": the friends you had the most planned breaks with in the last USUAL_WEEKS weeks (a
    request between you two, either way, that the one asked said yes to; not taken back), most first, at most
    USUAL_MAX. Fewer than USUAL_MIN: filled up with your pinned friends (count 0). Only friends who can see you and
    aren't hidden. -> [{id, display_name, avatar_color, photo, count}]"""
    today, _ = _now(user)
    mates = [m for m in friends.visible_friends(user["id"]) if not m["hidden"]]
    by_id = {m["user"]["id"]: m for m in mates}
    counts: Counter = Counter()
    for r in db.rows("SELECT b.from_id, m.user_id FROM break_requests b JOIN break_request_members m "
                     "ON m.request_id=b.id WHERE b.cancelled_at IS NULL AND m.response='accepted' "
                     "AND b.day BETWEEN %s AND %s AND (b.from_id=%s OR m.user_id=%s)",
                     (today - dt.timedelta(weeks=USUAL_WEEKS), today, user["id"], user["id"])):
        other = r["user_id"] if r["from_id"] == user["id"] else r["from_id"]
        if other in by_id and other != user["id"]:
            counts[other] += 1
    order = {uid: i for i, uid in enumerate(by_id)}
    ids = sorted(counts, key=lambda i: (-counts[i], order[i]))[:USUAL_MAX]
    if len(ids) < USUAL_MIN:
        ids += [i for i, m in by_id.items() if m["pinned"] and i not in ids][:USUAL_MIN - len(ids)]
    return [{**_person(i, by_id[i]["user"]["display_name"], by_id[i]["user"]["avatar_color"],
                       by_id[i]["user"].get("photo_v")), "count": counts.get(i, 0)} for i in ids]


def delete_user(c, uid: int):
    """Account deletion: their requests and their answers go too."""
    db.run("DELETE m FROM break_request_members m JOIN break_requests b ON b.id=m.request_id WHERE b.from_id=%s",
           (uid,), c)
    db.run("DELETE FROM break_requests WHERE from_id=%s", (uid,), c)
    db.run("DELETE FROM break_request_members WHERE user_id=%s", (uid,), c)
