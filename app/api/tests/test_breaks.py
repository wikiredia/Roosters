import datetime as dt

from roosters import db, logic, sync
from roosters.breaks import already_asked, conflict, flip, school_change, school_week, summarize

from .conftest import add_class_lessons, befriend, login, onboard, today

H = 60
# Tomorrow, so no break is "already over" whenever the tests run
DAY = today() + dt.timedelta(days=1)


def info(lessons, checkin=None):
    return logic.day_info(logic.PersonDay(1, "Kayra", [(a * H, b * H) for a, b in lessons], {1}, set(), set(), checkin))


# ---- Pure parts --------------------------------------------------------------------

def test_conflict():
    assert conflict(info([(9, 10), (12, 13)]), 10 * H, 12 * H) is None
    assert conflict(info([(9, 10), (11, 13)]), 10 * H, 11 * H + 30) == "in_class"
    # Before the first and after the last lesson is fine
    assert conflict(info([(9, 10)]), 8 * H, 9 * H) is None
    assert conflict(info([(9, 10)]), 10 * H, 11 * H) is None
    assert conflict(info([]), 10 * H, 11 * H) == "no_classes"
    assert conflict(info([(9, 10)], {"status": "absent"}), 10 * H, 11 * H) == "no_classes"
    assert conflict(info([(9, 10), (14, 15)], {"status": "home", "since_min": 11 * H}), 12 * H, 13 * H) == "home"


def test_summary_and_flip():
    assert summarize(["pending", "declined"]) == "pending"
    assert summarize(["accepted", "declined"]) == "planned"
    assert summarize(["declined"]) == "declined"
    assert flip("i_come") == "you_come" and flip("you_come") == "i_come" and flip("meet") == "meet"


def E(rid, frm, s, e, members):
    return {"id": rid, "from_id": frm, "start": s * H, "end": e * H, "members": members}


def test_already_asked():
    hit = already_asked([E(1, 1, 12, 13, {2: "pending"})], 1, [2], 12 * H + 30, 13 * H)
    assert hit == {"id": 1, "kind": "mine", "state": "pending", "who": [2]}
    hit = already_asked([E(1, 2, 12, 13, {1: "accepted"})], 1, [2], 12 * H, 13 * H)
    assert hit["kind"] == "theirs" and hit["state"] == "accepted"
    # A no, another time or other people: you can ask
    assert already_asked([E(1, 1, 12, 13, {2: "declined"})], 1, [2], 12 * H, 13 * H) is None
    assert already_asked([E(1, 1, 10, 11, {2: "pending"})], 1, [2], 12 * H, 13 * H) is None
    assert already_asked([E(1, 1, 12, 13, {3: "pending"})], 1, [2], 12 * H, 13 * H) is None


# ---- Through the API ---------------------------------------------------------------

def _setup(client, mails, school):
    """Reda (class 1) free 10:00-12:00, Kayra (class 2) free 10:30-12:00, same campus, friends."""
    k1, k2 = school["classes"]
    db.run("UPDATE school_classes SET last_ok=UTC_TIMESTAMP()")
    add_class_lessons(k1, [("09:00", "10:00", "Databases", "B204"), ("12:00", "13:00", "DevOps", "C102")], DAY)
    add_class_lessons(k2, [("09:00", "10:30", "Python Advanced", "A.1.05"), ("12:00", "14:00", "Cloud Computing", "B204")],
                      DAY)
    reda = login(client, "reda@example.com", mails)
    kayra = login(client, "kayra@example.com", mails)
    onboard(client, reda, school, k1)
    onboard(client, kayra, school, k2)
    befriend(client, reda, kayra)
    return reda, kayra


def _ask(client, who, to, start=630, end=720, **extra):
    return client.post("/api/v1/breaks", headers=who["headers"],
                       json={"to_ids": [to["user_id"]], "day": DAY.isoformat(), "start": start, "end": end, **extra})


def test_ask_and_say_yes(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    r = _ask(client, reda, kayra, mode="meet", place="  cafetaria ", note="Ik trakteer")
    assert r.status_code == 201, r.text
    b = r.json()["break"]
    assert (b["mine"], b["state"], b["place"], b["note"]) == (True, "pending", "cafetaria", "Ik trakteer")
    assert [m["id"] for m in b["members"]] == [kayra["user_id"]]
    # Kayra sees it (also on Today) and gets a notification
    theirs = client.get("/api/v1/breaks", headers=kayra["headers"]).json()["breaks"]
    assert [(x["id"], x["mine"], x["my_response"]) for x in theirs] == [(b["id"], False, "pending")]
    t = client.get("/api/v1/me/today", headers=kayra["headers"]).json()
    assert [x["id"] for x in t["breaks"]] == [b["id"]]
    kinds = [n["kind"] for n in client.get("/api/v1/me/notifications", headers=kayra["headers"]).json()["notifications"]]
    assert "break_request" in kinds
    r = client.post(f"/api/v1/breaks/{b['id']}/respond", headers=kayra["headers"], json={"response": "accepted"})
    assert r.json()["break"]["state"] == "planned"
    mine = client.get("/api/v1/breaks", headers=reda["headers"]).json()["breaks"][0]
    assert mine["state"] == "planned" and mine["members"][0]["response"] == "accepted"
    answers = [n for n in client.get("/api/v1/me/notifications", headers=reda["headers"]).json()["notifications"]
               if n["kind"] == "break_answer"]
    assert answers[0]["payload"]["response"] == "accepted"


def test_no_asking_twice_from_either_side(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    first = _ask(client, reda, kayra).json()["break"]
    r = _ask(client, reda, kayra, start=660)
    assert r.status_code == 409 and r.json()["code"] == "break_dup" and r.json()["kind"] == "mine"
    r = _ask(client, kayra, reda)
    assert r.status_code == 409 and r.json()["kind"] == "theirs" and r.json()["request"] == first["id"]
    # After a no you can ask again
    client.post(f"/api/v1/breaks/{first['id']}/respond", headers=kayra["headers"], json={"response": "declined"})
    assert _ask(client, reda, kayra).status_code == 201


def test_busy_people_and_bad_times_are_refused(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    # Kayra has class until 10:30
    r = _ask(client, reda, kayra, start=600, end=660)
    assert r.status_code == 400 and r.json()["people"] == [{"id": kayra["user_id"], "reason": "in_class"}]
    # Reda has class from 12:00
    r = _ask(client, reda, kayra, start=690, end=750)
    assert r.json()["code"] == "break_busy_me" and r.json()["reason"] == "in_class"
    assert _ask(client, reda, kayra, start=700, end=702).json()["code"] == "break_time"
    far = {"to_ids": [kayra["user_id"]], "day": (today() + dt.timedelta(days=30)).isoformat(), "start": 630, "end": 720}
    assert client.post("/api/v1/breaks", headers=reda["headers"], json=far).json()["code"] == "break_day"


def test_only_friends_and_not_guests(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    amir = login(client, "amir@example.com", mails)
    onboard(client, amir, school, school["classes"][0])
    assert _ask(client, reda, amir).status_code == 404
    guest = client.post("/api/v1/auth/guest", json={"platform": "ios"}).json()
    r = client.post("/api/v1/breaks", headers={"Authorization": f"Bearer {guest['access_token']}"},
                    json={"to_ids": [reda["user_id"]], "start": 630, "end": 720})
    assert r.status_code == 403


def test_another_time_and_taking_it_back(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    b = _ask(client, reda, kayra, mode="i_come").json()["break"]
    # Kayra: not then, 11:00-11:45
    r = client.post(f"/api/v1/breaks/{b['id']}/counter", headers=kayra["headers"], json={"start": 660, "end": 705})
    assert r.status_code == 201, r.text
    c = r.json()["break"]
    assert (c["mine"], c["start"], c["end"], c["mode"], c["counter_of"]) == (True, 660, 705, "you_come", b["id"])
    redas = {x["id"]: x for x in client.get("/api/v1/breaks", headers=reda["headers"]).json()["breaks"]}
    assert redas[b["id"]]["state"] == "declined" and redas[c["id"]]["my_response"] == "pending"
    # Kayra takes hers back: gone for both
    client.post(f"/api/v1/breaks/{c['id']}/cancel", headers=kayra["headers"])
    assert c["id"] not in {x["id"] for x in client.get("/api/v1/breaks", headers=reda["headers"]).json()["breaks"]}
    # Only the one who asked can take it back
    assert client.post(f"/api/v1/breaks/{b['id']}/cancel", headers=kayra["headers"]).status_code == 404


def test_unfriending_and_deleting_hide_requests(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    _ask(client, reda, kayra)
    client.delete(f"/api/v1/friends/{kayra['user_id']}", headers=reda["headers"])
    assert client.get("/api/v1/breaks", headers=kayra["headers"]).json()["breaks"] == []
    assert client.get("/api/v1/breaks", headers=reda["headers"]).json()["breaks"] == []
    client.delete("/api/v1/me", headers=reda["headers"])
    assert db.one("SELECT COUNT(*) AS n FROM break_requests")["n"] == 0
    assert db.one("SELECT COUNT(*) AS n FROM break_request_members")["n"] == 0


def test_busy_in_the_breaks_cant_be_asked():
    i = info([(9, 10), (12, 13)], {"break_status": "busy"})
    assert conflict(i, 10 * H + 30, 11 * H) == "busy"
    # After school is still fine
    assert conflict(i, 13 * H, 14 * H) is None


# ---- Cards in the chat -------------------------------------------------------------

def test_the_card_goes_in_the_direct_chat(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    r = _ask(client, reda, kayra)
    d = client.post("/api/v1/chats/direct", headers=reda["headers"], json={"user_id": kayra["user_id"]}).json()["chat"]
    assert r.json()["chats"] == [d["id"]]
    b = r.json()["break"]
    note = next(n for n in client.get("/api/v1/me/notifications", headers=kayra["headers"]).json()["notifications"]
                if n["kind"] == "break_request")
    assert note["payload"]["chat"] == d["id"]
    # "Ander uur": its own card, in the same chat
    c = client.post(f"/api/v1/breaks/{b['id']}/counter", headers=kayra["headers"], json={"start": 660, "end": 705}).json()
    assert c["chats"] == [d["id"]]
    cards = [m["payload"]["request"] for m in client.get(f"/api/v1/chats/{d['id']}/messages",
                                                         headers=reda["headers"]).json()["messages"]]
    assert cards == [b["id"], c["break"]["id"]]
    # Kayra takes hers back: Reda hears it, with the chat
    client.post(f"/api/v1/breaks/{c['break']['id']}/respond", headers=reda["headers"], json={"response": "accepted"})
    client.post(f"/api/v1/breaks/{c['break']['id']}/cancel", headers=kayra["headers"])
    gone = next(n for n in client.get("/api/v1/me/notifications", headers=reda["headers"]).json()["notifications"]
                if n["kind"] == "break_cancelled")
    assert gone["payload"]["chat"] == d["id"]


def test_a_group_of_exactly_them_gets_one_card(client, mails, school):
    # Signed in first: signing in runs the queued jobs, which would sync (and empty) the test timetables
    lotte = login(client, "lotte@example.com", mails)
    reda, kayra = _setup(client, mails, school)
    onboard(client, lotte, school, school["classes"][0])
    befriend(client, reda, lotte)
    befriend(client, kayra, lotte)
    g = client.post("/api/v1/chats", headers=kayra["headers"],
                    json={"name": "Bende", "user_ids": [reda["user_id"], lotte["user_id"]]}).json()["chat"]
    r = client.post("/api/v1/breaks", headers=reda["headers"],
                    json={"to_ids": [kayra["user_id"], lotte["user_id"]], "day": DAY.isoformat(), "start": 630, "end": 720})
    assert r.status_code == 201, r.text
    assert r.json()["chats"] == [g["id"]]
    assert db.one("SELECT COUNT(*) AS n FROM chat_messages WHERE kind='request'")["n"] == 1
    # Both answers point at the group
    for who in (kayra, lotte):
        client.post(f"/api/v1/breaks/{r.json()['break']['id']}/respond", headers=who["headers"], json={"response": "declined"})
    answers = [n["payload"]["chat"] for n in client.get("/api/v1/me/notifications", headers=reda["headers"]).json()["notifications"]
               if n["kind"] == "break_answer"]
    assert answers == [g["id"], g["id"]]
    # Only one of them: the direct chat, not the group
    one = _ask(client, reda, lotte, start=640, end=700).json()
    assert one["chats"] != [g["id"]] and len(one["chats"]) == 1
    # Lotte and Reda aren't friends any more: in the group, the card shows Lotte nothing
    client.delete(f"/api/v1/friends/{reda['user_id']}", headers=lotte["headers"])
    card = client.get(f"/api/v1/chats/{g['id']}/messages", headers=lotte["headers"]).json()["messages"][-1]
    assert card["kind"] == "request" and card["request"] is None


# ---- Can it still happen? ----------------------------------------------------------

def test_school_change_and_week():
    def L(s, e, state="normal", skipped=False):
        return {"start_min": s * H, "end_min": e * H, "state": state, "skipped": skipped}
    assert school_change([L(11, 12, "extra")], 10 * H, 12 * H) == "new_lesson"
    assert school_change([L(11, 12, "changed"), L(10, 11, "extra")], 10 * H, 12 * H) == "new_lesson"
    assert school_change([L(11, 12, "changed")], 10 * H, 12 * H) == "moved"
    # A normal lesson in the way (a skip undone) or nothing in the way: no reason
    assert school_change([L(11, 12, "changed"), L(10, 11)], 10 * H, 12 * H) is None
    assert school_change([L(13, 14, "extra"), L(11, 12, "cancelled")], 10 * H, 12 * H) is None
    wed, sat = dt.date(2026, 10, 28), dt.date(2026, 10, 31)
    assert school_week(wed) == (wed, dt.date(2026, 10, 30))
    assert school_week(sat) == (dt.date(2026, 11, 2), dt.date(2026, 11, 6))
    assert school_week(dt.date(2026, 11, 1)) == (dt.date(2026, 11, 2), dt.date(2026, 11, 6))


def _lesson(class_id, start, end, state):
    l = {"uid": f"x:{class_id}:{start}", "day": DAY, "start_min": start, "end_min": end, "course": "Extra",
         "location": "A1", "state": state}
    return db.run("INSERT INTO class_lessons (school_class_id, uid, day, start_min, end_min, course, location, state, "
                  "fingerprint) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                  (class_id, l["uid"], DAY, start, end, "Extra", "A1", state, sync.fingerprint(l)))


def test_a_card_says_when_the_break_cant_happen_any_more(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    r = _ask(client, reda, kayra).json()
    url = f"/api/v1/chats/{r['chats'][0]}/messages"

    def card(who=reda, tag=None):
        res = client.get(url, headers={**who["headers"], **({"X-If-None-Match": tag} if tag else {})})
        req = res.json()["messages"][-1]["request"]
        return (req["possible"], req["blocked"]), res.headers["etag"]

    first, tag = card()
    assert first == (True, None)
    # The school adds a lesson in Kayra's class during the break: not possible, the school's doing
    lid = _lesson(school["classes"][1], 660, 690, "extra")
    now, tag2 = card(tag=tag)
    assert now == (False, "new_lesson") and tag2 != tag
    assert card(kayra)[0] == (False, "new_lesson")
    # A lesson moved there
    db.run("UPDATE class_lessons SET state='changed' WHERE id=%s", (lid,))
    assert card()[0] == (False, "moved")
    # A normal lesson (e.g. a skip undone): no reason given
    db.run("UPDATE class_lessons SET state='normal' WHERE id=%s", (lid,))
    assert card()[0] == (False, None)
    # Kayra says "Ik ben bezig" for her breaks that day: not possible, no reason
    db.run("DELETE FROM class_lessons WHERE id=%s", (lid,))
    assert card()[0] == (True, None)
    db.run("INSERT INTO checkins (user_id, day, break_status, since_min) VALUES (%s,%s,'busy',0)", (kayra["user_id"], DAY))
    assert card()[0] == (False, None)
    # Declined: not asked any more (possible as it is)
    client.post(f"/api/v1/breaks/{r['break']['id']}/respond", headers=kayra["headers"], json={"response": "declined"})
    assert card()[0] == (True, None)


# ---- "Meestal ga je met" -----------------------------------------------------------

def _past(frm, to, days_ago, response="accepted", cancelled=False):
    rid = db.run("INSERT INTO break_requests (from_id, day, start_min, end_min, cancelled_at) VALUES (%s,%s,600,660,%s)",
                 (frm["user_id"], today() - dt.timedelta(days=days_ago), dt.datetime(2026, 1, 1) if cancelled else None))
    db.run("INSERT INTO break_request_members (request_id, user_id, response) VALUES (%s,%s,%s)",
           (rid, to["user_id"], response))


def test_usual_partners(client, mails):
    reda, kayra, lotte, sam, amir = [login(client, f"{n}@example.com", mails) for n in ("reda", "kayra", "lotte", "sam", "amir")]
    for other in (kayra, lotte, sam, amir):
        befriend(client, reda, other)
    usual = lambda: [(p["id"], p["count"]) for p in client.get("/api/v1/breaks/usual", headers=reda["headers"]).json()["people"]]  # noqa: E731
    assert usual() == []
    # Pinned friends fill up an empty list
    client.patch(f"/api/v1/friends/{sam['user_id']}", headers=reda["headers"], json={"pinned": True})
    assert usual() == [(sam["user_id"], 0)]
    _past(reda, kayra, 3)
    _past(kayra, reda, 10)                       # they asked, Reda said yes
    _past(lotte, reda, 1)
    _past(reda, lotte, 2, cancelled=True)        # taken back: doesn't count
    _past(reda, amir, 2, response="declined")    # a no doesn't count
    _past(reda, amir, 70)                        # too long ago
    assert usual() == [(kayra["user_id"], 2), (lotte["user_id"], 1), (sam["user_id"], 0)]
    # Three or more: no filling up
    _past(amir, reda, 4)
    assert usual() == [(kayra["user_id"], 2), (amir["user_id"], 1), (lotte["user_id"], 1)]
    p = client.get("/api/v1/breaks/usual", headers=reda["headers"]).json()["people"][0]
    assert set(p) == {"id", "display_name", "avatar_color", "photo", "count"}
