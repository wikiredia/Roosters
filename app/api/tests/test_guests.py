"""Guests: start without signing in, sign in later without losing anything, no friends until then."""
import re

from roosters import db

from .conftest import befriend, login, onboard, run_jobs


def guest(client) -> dict:
    r = client.post("/api/v1/auth/guest", json={"platform": "ios", "device_name": "iPhone"})
    assert r.status_code == 200, r.text
    out = r.json()
    out["headers"] = {"Authorization": f"Bearer {out['access_token']}"}
    out["user_id"] = client.get("/api/v1/me", headers=out["headers"]).json()["user"]["id"]
    return out


def _code(mails, email: str) -> str:
    """The newest code mail to this address (a welcome mail can come after it)."""
    return next(m.group(0).replace(" ", "") for to, _, b in reversed(mails)
                if to == email and (m := re.search(r"(\d{3}) (\d{3})", b)))


def verify_as(client, mails, email: str, headers: dict) -> dict:
    """E-mail code sign-in while signed in as a guest (the app sends the guest's token along)."""
    client.post("/api/v1/auth/email/start", json={"email": email})
    run_jobs()
    code = _code(mails, email)
    r = client.post("/api/v1/auth/email/verify", json={"email": email, "code": code, "platform": "ios"},
                    headers=headers)
    assert r.status_code == 200, r.text
    out = r.json()
    out["headers"] = {"Authorization": f"Bearer {out['access_token']}"}
    return out


def test_a_guest_can_use_their_own_timetable(client, school):
    g = guest(client)
    me = client.get("/api/v1/me", headers=g["headers"]).json()["user"]
    assert me["guest"] is True and me["email"] is None and me["school_id"] is None
    onboard(client, g, school, school["classes"][0])
    assert client.get("/api/v1/me/today", headers=g["headers"]).status_code == 200
    assert client.get("/api/v1/me/schedule", headers=g["headers"]).status_code == 200


def test_guests_get_no_friends_features(client, school, mails):
    g = guest(client)
    for method, path in (("get", "/api/v1/friends"), ("post", "/api/v1/invites"), ("get", "/api/v1/classmates"),
                         ("get", "/api/v1/friends/requests")):
        r = getattr(client, method)(path, headers=g["headers"])
        assert r.status_code == 403 and r.json()["code"] == "verify_required", path
    # ...but they may look at an invite link before signing in
    a = login(client, "ana@example.com", mails)
    code = client.post("/api/v1/invites", headers=a["headers"]).json()["invite"]["code"]
    assert client.get(f"/api/v1/invites/{code}", headers=g["headers"]).status_code == 200
    assert client.post(f"/api/v1/invites/{code}/accept", headers=g["headers"]).status_code == 403


def test_guests_never_show_up_for_others(client, school, mails):
    a = login(client, "ana@example.com", mails)
    onboard(client, a, school, school["classes"][0])
    g = guest(client)
    onboard(client, g, school, school["classes"][0])
    assert client.get("/api/v1/classmates", headers=a["headers"]).json()["classmates"] == []
    r = client.post("/api/v1/friends/requests", headers=a["headers"], json={"user_id": g["user_id"]})
    assert r.status_code == 404


def test_signing_in_keeps_the_guest_account(client, school, mails):
    g = guest(client)
    onboard(client, g, school, school["classes"][0])
    out = verify_as(client, mails, "bo@example.com", g["headers"])
    assert out["is_new"] is False
    me = client.get("/api/v1/me", headers=out["headers"]).json()["user"]
    assert me["id"] == g["user_id"] and me["guest"] is False and me["email"] == "bo@example.com"
    assert me["display_name"] == "bo"
    assert me["school_id"] == school["id"] and me["onboarded"] is True
    assert len(client.get("/api/v1/me/sources", headers=out["headers"]).json()["sources"]) == 1
    # The guest token stopped working; friends work now
    assert client.get("/api/v1/me", headers=g["headers"]).status_code == 401
    assert client.get("/api/v1/friends", headers=out["headers"]).status_code == 200


def test_signing_in_to_an_existing_account_folds_the_guest_in(client, school, mails):
    old = login(client, "bo@example.com", mails)
    g = guest(client)
    onboard(client, g, school, school["classes"][0])
    out = verify_as(client, mails, "bo@example.com", g["headers"])
    me = client.get("/api/v1/me", headers=out["headers"]).json()["user"]
    assert me["id"] == old["user_id"] and me["school_id"] == school["id"]
    # The account had no timetable: the guest's came along; the guest itself is gone
    assert len(client.get("/api/v1/me/sources", headers=out["headers"]).json()["sources"]) == 1
    assert db.one("SELECT id FROM users WHERE id=%s", (g["user_id"],)) is None


def test_an_existing_timetable_wins_over_the_guest(client, school, mails):
    old = login(client, "bo@example.com", mails)
    onboard(client, old, school, school["classes"][1])
    g = guest(client)
    onboard(client, g, school, school["classes"][0])
    out = verify_as(client, mails, "bo@example.com", g["headers"])
    srcs = client.get("/api/v1/me/sources", headers=out["headers"]).json()["sources"]
    assert [s["class_id"] for s in srcs] == [school["classes"][1]]


def test_a_signed_in_user_signing_in_again_is_not_merged(client, school, mails):
    a = login(client, "ana@example.com", mails)
    b = login(client, "bo@example.com", mails)
    befriend(client, a, b)
    out = verify_as(client, mails, "bo@example.com", a["headers"])
    assert client.get("/api/v1/me", headers=out["headers"]).json()["user"]["id"] == b["user_id"]
    assert db.one("SELECT id FROM users WHERE id=%s", (a["user_id"],)) is not None


def test_disabled_accounts_are_locked_out(client, mails):
    a = login(client, "ana@example.com", mails)
    db.run("UPDATE users SET disabled_at=UTC_TIMESTAMP() WHERE id=%s", (a["user_id"],))
    assert client.get("/api/v1/me", headers=a["headers"]).status_code == 401
    client.post("/api/v1/auth/email/start", json={"email": "ana@example.com"})
    run_jobs()
    code = _code(mails, "ana@example.com")
    r = client.post("/api/v1/auth/email/verify", json={"email": "ana@example.com", "code": code})
    assert r.status_code == 403 and r.json()["code"] == "account_disabled"


def test_cleanup_removes_guests_without_a_session(client):
    g = guest(client)
    db.run("UPDATE users SET created_at=UTC_TIMESTAMP() - INTERVAL 30 DAY WHERE id=%s", (g["user_id"],))
    db.run("UPDATE sessions SET expires_at=UTC_TIMESTAMP() - INTERVAL 1 DAY WHERE user_id=%s", (g["user_id"],))
    from roosters import jobs, worker  # noqa: F401 (registers the cleanup job)
    jobs.enqueue("cleanup")
    run_jobs()
    assert db.one("SELECT id FROM users WHERE id=%s", (g["user_id"],)) is None
