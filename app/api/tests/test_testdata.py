import datetime as dt

import pytest
from fastapi.testclient import TestClient

from roosters import config, db, testdata
from roosters.app import app

from .conftest import login, onboard, today


@pytest.fixture
def local():
    """Switching users and test data only answer from this computer or a private network."""
    return TestClient(app, client=("127.0.0.1", 50000))


def _me(local, mails, school):
    me = login(local, "reda@example.com", mails)
    onboard(local, me, school, school["classes"][0])
    return me


def test_test_friends_with_a_timetable_and_switching_to_them(local, mails, school):
    me = _me(local, mails, school)
    r = local.post("/api/v1/debug/test-users", headers=me["headers"], json={"count": 2})
    assert r.status_code == 201, r.text
    ids = r.json()["created"]
    friends = local.get("/api/v1/friends", headers=me["headers"]).json()["friends"]
    assert sorted(f["id"] for f in friends) == sorted(ids)
    # Every test person has lessons this week, at my school and campus
    monday = today() - dt.timedelta(days=today().weekday())
    week = local.get(f"/api/v1/friends/{ids[0]}/schedule", headers=me["headers"], params={"start": monday.isoformat()}).json()
    assert week["lessons"] and all(l["location"] for l in week["lessons"])
    u = db.one("SELECT school_id, campus_id FROM users WHERE id=%s", (ids[0],))
    assert (u["school_id"], u["campus_id"]) == (school["id"], school["campuses"][0])
    # The list shows them as test friends, and me as me
    users = local.get("/api/v1/debug/users", headers=me["headers"]).json()
    assert users["me"] == me["user_id"]
    row = next(x for x in users["users"] if x["id"] == ids[0])
    assert row["test"] and row["friend"] and row["my_visibility"] == "full"
    # Switch: a normal session for that person
    t = local.post("/api/v1/debug/login", json={"user_id": ids[0]}).json()
    them = {"Authorization": f"Bearer {t['access_token']}"}
    assert local.get("/api/v1/me", headers=them).json()["user"]["id"] == ids[0]
    assert local.post("/api/v1/auth/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 200


def test_rooms_hidden_for_one_friend(local, mails, school):
    me = _me(local, mails, school)
    other = local.post("/api/v1/debug/test-users", headers=me["headers"], json={"count": 1}).json()["created"][0]
    t = local.post("/api/v1/debug/login", json={"user_id": other}).json()
    them = {"Authorization": f"Bearer {t['access_token']}"}
    # The test person shows me everything but the rooms
    assert local.patch(f"/api/v1/friends/{me['user_id']}", headers=them, json={"visibility": "norooms"}).status_code == 200
    monday = (today() - dt.timedelta(days=today().weekday())).isoformat()
    week = local.get(f"/api/v1/friends/{other}/schedule", headers=me["headers"], params={"start": monday}).json()
    assert week["visibility"] == "norooms"
    assert all(l["course"] and l["location"] is None for l in week["lessons"])


def test_timetable_friends_and_removing(local, mails, school):
    me = _me(local, mails, school)
    stranger = local.post("/api/v1/debug/test-users", headers=me["headers"], json={"count": 1, "befriend": False}).json()["created"][0]
    assert local.get("/api/v1/friends", headers=me["headers"]).json()["friends"] == []
    local.put(f"/api/v1/debug/friends/{stranger}", headers=me["headers"], json={"friends": True})
    assert [f["id"] for f in local.get("/api/v1/friends", headers=me["headers"]).json()["friends"]] == [stranger]
    # A test timetable for my own account too; again replaces it
    n = local.post(f"/api/v1/debug/users/{me['user_id']}/timetable").json()["lessons"]
    assert n > 0 and local.post(f"/api/v1/debug/users/{me['user_id']}/timetable").json()["lessons"] == n
    assert db.one("SELECT COUNT(*) AS n FROM sources WHERE user_id=%s AND label='Testrooster'", (me["user_id"],))["n"] == 1
    # Real accounts can't be removed here; test people can, one or all
    assert local.delete(f"/api/v1/debug/users/{me['user_id']}").status_code == 404
    assert local.delete(f"/api/v1/debug/users/{stranger}").status_code == 204
    local.post("/api/v1/debug/test-users", headers=me["headers"], json={"count": 3})
    assert local.delete("/api/v1/debug/test-users").json()["removed"] == 3
    assert db.one("SELECT COUNT(*) AS n FROM users WHERE email LIKE %s", (f"%@{testdata.TEST_DOMAIN}",))["n"] == 0
    assert local.get("/api/v1/friends", headers=me["headers"]).json()["friends"] == []


def test_only_in_dev_and_only_from_a_private_network(local, client, mails, school, monkeypatch):
    me = _me(local, mails, school)
    outside = TestClient(app, client=("8.8.8.8", 50000))
    assert outside.post("/api/v1/debug/login", json={"user_id": me["user_id"]}).status_code == 404
    # Through a proxy: every hop must be private
    r = local.post("/api/v1/debug/login", json={"user_id": me["user_id"]}, headers={"X-Forwarded-For": "8.8.8.8"})
    assert r.status_code == 404
    monkeypatch.setattr(config, "DEV", False)
    assert local.post("/api/v1/debug/login", json={"user_id": me["user_id"]}).status_code == 404
    assert local.get("/api/v1/debug/users").status_code == 404


def test_lessons_are_the_same_every_time_and_weekdays_only():
    a = testdata.lessons_for(7, dt.date(2026, 10, 19), 7)
    assert a == testdata.lessons_for(7, dt.date(2026, 10, 19), 7)
    assert {l["day"].weekday() for l in a} <= {0, 1, 2, 3, 4}
    for d in {l["day"] for l in a}:
        ls = sorted((l for l in a if l["day"] == d), key=lambda l: l["start_min"])
        assert 1 <= len(ls) <= 4
        assert all(x["end_min"] <= y["start_min"] for x, y in zip(ls, ls[1:]))

