import datetime as dt

from roosters import db

from .conftest import add_class_lessons, befriend, login, onboard, today

# Tomorrow, so no break is "already over" whenever the tests run
DAY = today() + dt.timedelta(days=1)


def _setup(client, mails, school):
    """Reda (class 1, campus 0) and Kayra (class 2, same campus), friends. Both have classes today."""
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


def test_invite_link_makes_friends_both_ways(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    for me, other in ((reda, kayra), (kayra, reda)):
        f = client.get("/api/v1/friends", headers=me["headers"]).json()["friends"]
        assert [x["id"] for x in f] == [other["user_id"]] and f[0]["visibility"] == "full"
    # Your own link doesn't work for yourself; an unknown one is refused
    code = client.post("/api/v1/invites", headers=reda["headers"]).json()["invite"]["code"]
    assert client.post(f"/api/v1/invites/{code}/accept", headers=reda["headers"]).json()["code"] == "invite_self"
    assert client.post("/api/v1/invites/ZZZZZZZZ/accept", headers=kayra["headers"]).status_code == 404


def test_friends_see_shared_breaks_and_the_now_board(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    t = client.get("/api/v1/me/today", headers=reda["headers"], params={"day": DAY.isoformat()}).json()
    assert [l["course"] for l in t["me"]["lessons"]] == ["Databases", "DevOps"]
    # Reda free 10:00-12:00, Kayra 10:30-12:00, same campus: break together 10:30-12:00
    assert [(x["id"], x["start"], x["end"]) for x in t["together"]] == [(kayra["user_id"], 630, 720)]
    assert [b["id"] for b in t["board"]] == [kayra["user_id"]]


def test_freebusy_hides_what_and_where(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    start = {"start": DAY.isoformat(), "days": 1}
    full = client.get(f"/api/v1/friends/{kayra['user_id']}/schedule", headers=reda["headers"], params=start).json()
    assert full["lessons"][0]["course"] == "Python Advanced"
    client.patch(f"/api/v1/friends/{reda['user_id']}", headers=kayra["headers"], json={"visibility": "freebusy"})
    fb = client.get(f"/api/v1/friends/{kayra['user_id']}/schedule", headers=reda["headers"], params=start).json()
    assert fb["visibility"] == "freebusy"
    assert all(set(l) == {"day", "start", "end", "busy"} for l in fb["lessons"])


def test_ghost_mode_hides_you_from_friends(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    client.put("/api/v1/me/ghost", headers=kayra["headers"], json={"minutes": 60})
    t = client.get("/api/v1/me/today", headers=reda["headers"], params={"day": DAY.isoformat()}).json()
    assert t["together"] == [] and t["board"] == [{"id": kayra["user_id"], "status": {"code": "hidden"}}]
    s = client.get(f"/api/v1/friends/{kayra['user_id']}/schedule", headers=reda["headers"]).json()
    assert s["hidden"] is True and s["lessons"] == []


def test_strangers_see_nothing(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    amir = login(client, "amir@example.com", mails)
    assert client.get(f"/api/v1/friends/{reda['user_id']}/schedule", headers=amir["headers"]).status_code == 404
    r = client.get("/api/v1/compare", headers=amir["headers"], params={"ids": str(reda["user_id"])}).json()
    assert r["missing"] == [reda["user_id"]] and [p["id"] for p in r["people"]] == [amir["user_id"]]


def test_blocking_ends_the_friendship_silently(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    client.post("/api/v1/blocks", headers=kayra["headers"], json={"user_id": reda["user_id"]})
    assert client.get("/api/v1/friends", headers=reda["headers"]).json()["friends"] == []
    # Reda can't tell: the request "goes through" but nothing reaches Kayra
    r = client.post("/api/v1/friends/requests", headers=reda["headers"], json={"user_id": kayra["user_id"]})
    assert r.status_code == 201
    assert client.get("/api/v1/friends/requests", headers=kayra["headers"]).json()["incoming"] == []
    code = client.post("/api/v1/invites", headers=reda["headers"]).json()["invite"]["code"]
    assert client.post(f"/api/v1/invites/{code}/accept", headers=kayra["headers"]).status_code == 403


def test_friend_requests_within_your_school(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    lotte = login(client, "lotte@example.com", mails)
    onboard(client, lotte, school, school["classes"][0])
    r = client.post("/api/v1/friends/requests", headers=lotte["headers"], json={"user_id": reda["user_id"]}).json()
    assert [x["user"]["id"] for x in r["outgoing"]] == [reda["user_id"]]
    incoming = client.get("/api/v1/friends/requests", headers=reda["headers"]).json()["incoming"]
    r = client.post(f"/api/v1/friends/requests/{incoming[0]['id']}/accept", headers=reda["headers"])
    assert r.status_code == 200
    ids = {f["id"] for f in client.get("/api/v1/friends", headers=lotte["headers"]).json()["friends"]}
    assert ids == {reda["user_id"]}
    # Someone without a school (or another school) can't be found this way
    noor = login(client, "noor@example.com", mails)
    assert client.post("/api/v1/friends/requests", headers=noor["headers"],
                       json={"user_id": reda["user_id"]}).status_code == 404


def test_compare_free_limit(client, mails, school):
    reda, _ = _setup(client, mails, school)
    r = client.get("/api/v1/compare", headers=reda["headers"], params={"ids": "1,2,3,4"})
    assert r.status_code == 402 and r.json()["code"] == "compare_limit" and r.json()["limit"] == 3


def test_today_has_an_etag(client, mails, school):
    reda, _ = _setup(client, mails, school)
    q = {"day": DAY.isoformat()}
    r = client.get("/api/v1/me/today", headers=reda["headers"], params=q)
    assert r.headers["cache-control"] == "no-store"
    again = client.get("/api/v1/me/today", headers={**reda["headers"], "X-If-None-Match": r.headers["etag"]}, params=q)
    # Never a real 304: iOS would answer that with its own (possibly stale 401) copy
    assert again.status_code == 200 and again.headers["x-not-modified"] == "1" and again.content == b""
    # A plain If-None-Match (the phone's HTTP cache adding one by itself) gets the full answer
    full = client.get("/api/v1/me/today", headers={**reda["headers"], "If-None-Match": r.headers["etag"]}, params=q)
    assert full.status_code == 200 and full.json() == r.json()


def test_delete_account_removes_everything(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    assert client.get("/api/v1/me/export", headers=reda["headers"]).json()["friends"][0]["friend_id"] == kayra["user_id"]
    assert client.delete("/api/v1/me", headers=reda["headers"]).status_code == 204
    assert client.get("/api/v1/me", headers=reda["headers"]).status_code == 401
    uid = reda["user_id"]
    for table, col in (("users", "id"), ("sources", "user_id"), ("auth_identities", "user_id"), ("sessions", "user_id"),
                       ("friendships", "friend_id"), ("invites", "user_id")):
        assert db.one(f"SELECT COUNT(*) AS n FROM {table} WHERE {col}=%s", (uid,))["n"] == 0, table
    assert client.get("/api/v1/friends", headers=kayra["headers"]).json()["friends"] == []


def test_a_retried_write_runs_once(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    h = {**reda["headers"], "Idempotency-Key": "retry-key-12345678"}
    first = client.put("/api/v1/me/checkin", headers=h, json={"status": "want_chill"})
    again = client.put("/api/v1/me/checkin", headers=h, json={"status": "want_chill"})
    assert first.status_code == again.status_code == 200
    assert again.headers.get("idempotent-replayed") == "true" and again.json() == first.json()
    # The same key on another endpoint is a mistake by the app
    other = client.post("/api/v1/me/refresh", headers=h)
    assert other.status_code == 422 and other.json()["code"] == "idempotency_mismatch"


def test_adding_a_class_requires_a_school(client, mails, school):
    noor = login(client, "noor@example.com", mails)
    r = client.post("/api/v1/me/sources/untis", headers=noor["headers"], json={"class_id": school["classes"][0]})
    assert r.json()["code"] == "school_required"
    client.patch("/api/v1/me", headers=noor["headers"], json={"school_id": school["id"]})
    other_school = db.run("INSERT INTO schools (slug, name) VALUES ('kdg','KdG')")
    other_class = db.run("INSERT INTO school_classes (school_id, untis_id, name) VALUES (%s, 1, 'X')", (other_school,))
    r = client.post("/api/v1/me/sources/untis", headers=noor["headers"], json={"class_id": other_class})
    assert r.json()["code"] == "class_unknown"


def test_classmates_are_people_in_your_classes_who_arent_friends_yet(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    lotte = login(client, "lotte@example.com", mails)
    onboard(client, lotte, school, school["classes"][0])     # same class as Reda
    amir = login(client, "amir@example.com", mails)
    onboard(client, amir, school, school["classes"][0])
    client.post("/api/v1/blocks", headers=amir["headers"], json={"user_id": reda["user_id"]})
    mates = client.get("/api/v1/classmates", headers=reda["headers"]).json()["classmates"]
    # Kayra is already a friend (other class anyway), Amir blocked Reda: only Lotte
    assert [(m["id"], m["classes"], m["requested"]) for m in mates] == [(lotte["user_id"], ["2ITCSC1a"], False)]
    client.post("/api/v1/friends/requests", headers=reda["headers"], json={"user_id": lotte["user_id"]})
    mates = client.get("/api/v1/classmates", headers=reda["headers"]).json()["classmates"]
    assert mates[0]["requested"] is True


def test_a_week_of_the_timetable_comes_with_the_shared_breaks_per_day(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    s = client.get("/api/v1/me/schedule", headers=reda["headers"],
                   params={"start": DAY.isoformat(), "days": 7, "together": 1}).json()
    assert [(x["id"], x["start"], x["end"]) for x in s["together"][DAY.isoformat()]] == [(kayra["user_id"], 630, 720)]
    # Without asking: not computed
    assert "together" not in client.get("/api/v1/me/schedule", headers=reda["headers"],
                                        params={"start": DAY.isoformat()}).json()
