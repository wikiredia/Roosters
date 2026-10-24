import datetime as dt

from fastapi.testclient import TestClient

from roosters import config, db, testdata
from roosters.app import app

from .conftest import login, onboard, today


def _me(client, mails, school, email="reda@example.com"):
    me = login(client, email, mails)
    onboard(client, me, school, school["classes"][0])
    return me


def _h(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_test_friends_with_a_timetable_and_switching_to_them(client, mails, school):
    me = _me(client, mails, school)
    r = client.post("/api/v1/debug/test-users", headers=me["headers"], json={"count": 2})
    assert r.status_code == 201, r.text
    ids = r.json()["created"]
    friends = client.get("/api/v1/friends", headers=me["headers"]).json()["friends"]
    assert sorted(f["id"] for f in friends) == sorted(ids)
    # Every test person has lessons this week, at my school and campus, and an e-mail sign-in like a real account
    monday = today() - dt.timedelta(days=today().weekday())
    week = client.get(f"/api/v1/friends/{ids[0]}/schedule", headers=me["headers"], params={"start": monday.isoformat()}).json()
    assert week["lessons"] and all(l["location"] for l in week["lessons"])
    u = db.one("SELECT school_id, campus_id, test_owner_id FROM users WHERE id=%s", (ids[0],))
    assert (u["school_id"], u["campus_id"], u["test_owner_id"]) == (school["id"], school["campuses"][0], me["user_id"])
    assert db.one("SELECT provider FROM auth_identities WHERE user_id=%s", (ids[0],))["provider"] == "email"
    # The list: me and my test people
    users = client.get("/api/v1/debug/users", headers=me["headers"]).json()
    assert users["me"] == users["owner"] == me["user_id"]
    assert [x["id"] for x in users["users"]] == [me["user_id"]] + sorted(ids)
    row = next(x for x in users["users"] if x["id"] == ids[0])
    assert row["test"] and row["friend"] and row["my_visibility"] == "full"
    # Switch: signed in like a real login, and this session signed out
    t = client.post("/api/v1/debug/login", headers=me["headers"], json={"user_id": ids[0], "platform": "ios"}).json()
    assert client.get("/api/v1/me", headers=_h(t)).json()["user"]["id"] == ids[0]
    assert client.get("/api/v1/me", headers=me["headers"]).status_code == 401
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 200
    sess = client.get("/api/v1/auth/sessions", headers=_h(t)).json()["sessions"]
    assert [s["platform"] for s in sess] == ["ios"]
    # As the test person: the same list (owner = me), and back to my own account
    users = client.get("/api/v1/debug/users", headers=_h(t)).json()
    assert users["me"] == ids[0] and users["owner"] == me["user_id"]
    back = client.post("/api/v1/debug/login", headers=_h(t), json={"user_id": me["user_id"]}).json()
    assert client.get("/api/v1/me", headers=_h(back)).json()["user"]["id"] == me["user_id"]


def test_never_another_real_account(client, mails, school):
    me = _me(client, mails, school)
    other = _me(client, mails, school, "kayra@example.com")
    theirs = client.post("/api/v1/debug/test-users", headers=other["headers"], json={"count": 1}).json()["created"][0]
    mine = client.post("/api/v1/debug/test-users", headers=me["headers"], json={"count": 1}).json()["created"][0]
    # Not in my list, not to switch to, befriend, give a timetable or remove: other real accounts and their test people
    listed = [x["id"] for x in client.get("/api/v1/debug/users", headers=me["headers"]).json()["users"]]
    assert listed == [me["user_id"], mine]
    for uid in (other["user_id"], theirs):
        assert client.post("/api/v1/debug/login", headers=me["headers"], json={"user_id": uid}).status_code == 404
        assert client.put(f"/api/v1/debug/friends/{uid}", headers=me["headers"], json={"friends": True}).status_code == 404
        assert client.post(f"/api/v1/debug/users/{uid}/timetable", headers=me["headers"]).status_code == 404
        assert client.delete(f"/api/v1/debug/users/{uid}", headers=me["headers"]).status_code == 404
    # Also not as my test person, and my real account can't be removed here
    t = client.post("/api/v1/debug/login", headers=me["headers"], json={"user_id": mine}).json()
    assert client.post("/api/v1/debug/login", headers=_h(t), json={"user_id": other["user_id"]}).status_code == 404
    assert client.delete(f"/api/v1/debug/users/{me['user_id']}", headers=_h(t)).status_code == 404
    # Removing all removes only mine
    assert client.delete("/api/v1/debug/test-users", headers=other["headers"]).json()["removed"] == 1
    assert db.one("SELECT COUNT(*) AS n FROM users WHERE id=%s", (mine,))["n"] == 1


def test_rooms_hidden_for_one_friend(client, mails, school):
    me = _me(client, mails, school)
    other = client.post("/api/v1/debug/test-users", headers=me["headers"], json={"count": 1}).json()["created"][0]
    t = client.post("/api/v1/debug/login", headers=me["headers"], json={"user_id": other}).json()
    them = _h(t)
    # The test person shows me everything but the rooms
    assert client.patch(f"/api/v1/friends/{me['user_id']}", headers=them, json={"visibility": "norooms"}).status_code == 200
    back = _h(client.post("/api/v1/debug/login", headers=them, json={"user_id": me["user_id"]}).json())
    monday = (today() - dt.timedelta(days=today().weekday())).isoformat()
    week = client.get(f"/api/v1/friends/{other}/schedule", headers=back, params={"start": monday}).json()
    assert week["visibility"] == "norooms"
    assert all(l["course"] and l["location"] is None for l in week["lessons"])


def test_timetable_friends_and_removing(client, mails, school):
    me = _me(client, mails, school)
    stranger = client.post("/api/v1/debug/test-users", headers=me["headers"], json={"count": 1, "befriend": False}).json()["created"][0]
    assert client.get("/api/v1/friends", headers=me["headers"]).json()["friends"] == []
    client.put(f"/api/v1/debug/friends/{stranger}", headers=me["headers"], json={"friends": True})
    assert [f["id"] for f in client.get("/api/v1/friends", headers=me["headers"]).json()["friends"]] == [stranger]
    # A test timetable for my own account too; again replaces it
    h = me["headers"]
    n = client.post(f"/api/v1/debug/users/{me['user_id']}/timetable", headers=h).json()["lessons"]
    assert n > 0 and client.post(f"/api/v1/debug/users/{me['user_id']}/timetable", headers=h).json()["lessons"] == n
    assert db.one("SELECT COUNT(*) AS n FROM sources WHERE user_id=%s AND label='Testrooster'", (me["user_id"],))["n"] == 1
    assert client.delete(f"/api/v1/debug/users/{stranger}", headers=h).status_code == 204
    client.post("/api/v1/debug/test-users", headers=h, json={"count": 3})
    assert client.delete("/api/v1/debug/test-users", headers=h).json()["removed"] == 3
    assert db.one("SELECT COUNT(*) AS n FROM users WHERE email LIKE %s", (f"%@{testdata.TEST_DOMAIN}",))["n"] == 0
    assert client.get("/api/v1/friends", headers=h).json()["friends"] == []


def test_signed_in_and_only_in_dev(client, mails, school, monkeypatch):
    me = _me(client, mails, school)
    assert client.get("/api/v1/debug/users").status_code == 401
    assert client.post("/api/v1/debug/login", json={"user_id": me["user_id"]}).status_code == 401
    # From any network: no IP lock any more
    outside = TestClient(app, client=("8.8.8.8", 50000))
    assert outside.get("/api/v1/debug/users", headers=me["headers"]).status_code == 200
    monkeypatch.setattr(config, "DEV", False)
    assert client.get("/api/v1/debug/users", headers=me["headers"]).status_code == 404


def test_deleting_my_account_takes_my_test_people(client, mails, school):
    me = _me(client, mails, school)
    client.post("/api/v1/debug/test-users", headers=me["headers"], json={"count": 2})
    assert client.delete("/api/v1/me", headers=me["headers"]).status_code == 204
    assert db.one("SELECT COUNT(*) AS n FROM users")["n"] == 0


def test_lessons_are_the_same_every_time_and_weekdays_only():
    a = testdata.lessons_for(7, dt.date(2026, 10, 19), 7)
    assert a == testdata.lessons_for(7, dt.date(2026, 10, 19), 7)
    assert {l["day"].weekday() for l in a} <= {0, 1, 2, 3, 4}
    for d in {l["day"] for l in a}:
        ls = sorted((l for l in a if l["day"] == d), key=lambda l: l["start_min"])
        assert 1 <= len(ls) <= 4
        assert all(x["end_min"] <= y["start_min"] for x, y in zip(ls, ls[1:]))



def test_test_chats_with_test_friends(client, mails, school):
    local = client
    me = _me(client, mails, school)
    assert local.post("/api/v1/debug/test-chats", headers=me["headers"]).status_code == 400
    local.post("/api/v1/debug/test-users", headers=me["headers"], json={"count": 3})
    group, direct = local.post("/api/v1/debug/test-chats", headers=me["headers"]).json()["chats"]
    chats = local.get("/api/v1/chats", headers=me["headers"]).json()
    assert {c["id"] for c in chats["chats"]} == {group, direct} and chats["unread"] == 5
    assert next(c for c in chats["chats"] if c["id"] == group)["name"] == "De bende"
    # Removing the test people takes their chats and messages
    local.delete("/api/v1/debug/test-users", headers=me["headers"])
    assert local.get("/api/v1/chats", headers=me["headers"]).json()["chats"][0]["count"] == 1
