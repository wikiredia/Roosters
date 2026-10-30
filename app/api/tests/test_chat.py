"""Chat: one-to-one and groups, unread and read, blocking and reporting (with the moderators' side), events from
breaks, account deletion."""
import pytest
from fastapi.testclient import TestClient

from roosters import admin, config, db
from roosters.chat import clean_body, direct_key

from .conftest import befriend, login
from .test_breaks import _ask, _setup

A = {"Authorization": f"Bearer {config.ADMIN_TOKEN}", "X-Admin-Actor": "MacBook"}


@pytest.fixture
def three(client, mails):
    """Reda, Kayra and Lotte, all friends with each other."""
    people = [login(client, f"{n}@example.com", mails) for n in ("reda", "kayra", "lotte")]
    befriend(client, people[0], people[1])
    befriend(client, people[0], people[2])
    befriend(client, people[1], people[2])
    return people


def _send(client, who, chat_id, body):
    r = client.post(f"/api/v1/chats/{chat_id}/messages", headers=who["headers"], json={"body": body})
    assert r.status_code == 201, r.text
    return r.json()["message"]


def _chats(client, who):
    return client.get("/api/v1/chats", headers=who["headers"]).json()


def test_pure_parts():
    assert direct_key(9, 3) == direct_key(3, 9) == "3:9"
    assert clean_body("  hoi  \r\n\r\n\r\n\ndaar \n") == "hoi\n\ndaar"
    assert clean_body(" \n ") is None


def test_one_to_one_unread_and_read(client, three):
    reda, kayra, _ = three
    chat = client.post("/api/v1/chats/direct", headers=reda["headers"], json={"user_id": kayra["user_id"]}).json()["chat"]
    # Opening it again, from either side, is the same chat
    again = client.post("/api/v1/chats/direct", headers=kayra["headers"], json={"user_id": reda["user_id"]}).json()["chat"]
    assert again["id"] == chat["id"] and again["name"] == "reda"
    first = _send(client, reda, chat["id"], "  Databases valt weg, koffie? ")
    assert first["body"] == "Databases valt weg, koffie?"
    _send(client, reda, chat["id"], "B-blok?")
    theirs = _chats(client, kayra)
    assert theirs["unread"] == 2 and theirs["chats"][0]["last"]["body"] == "B-blok?"
    assert _chats(client, reda)["unread"] == 0
    msgs = client.get(f"/api/v1/chats/{chat['id']}/messages", headers=kayra["headers"]).json()
    assert [m["body"] for m in msgs["messages"]] == ["Databases valt weg, koffie?", "B-blok?"] and not msgs["more"]
    assert client.get(f"/api/v1/chats/{chat['id']}/messages", headers=kayra["headers"],
                      params={"after": first["id"]}).json()["messages"][0]["body"] == "B-blok?"
    assert client.post(f"/api/v1/chats/{chat['id']}/read", headers=kayra["headers"],
                       json={"up_to_id": 10 ** 9}).status_code == 204
    assert _chats(client, kayra)["unread"] == 0
    # "gelezen": Reda sees how far Kayra read (never past the newest message)
    people = client.get(f"/api/v1/chats/{chat['id']}", headers=reda["headers"]).json()["chat"]["people"]
    assert next(p for p in people if p["id"] == kayra["user_id"])["last_read_id"] == msgs["messages"][-1]["id"]
    # Taking one back: gone for everyone
    assert client.delete(f"/api/v1/chats/{chat['id']}/messages/{first['id']}", headers=reda["headers"]).status_code == 204
    m = client.get(f"/api/v1/chats/{chat['id']}/messages", headers=kayra["headers"]).json()["messages"][0]
    assert m["deleted"] and m["body"] is None
    assert client.delete(f"/api/v1/chats/{chat['id']}/messages/{msgs['messages'][1]['id']}",
                         headers=kayra["headers"]).status_code == 404


def test_only_friends_and_not_after_unfriending(client, mails, three):
    reda, kayra, _ = three
    stranger = login(client, "noor@example.com", mails)
    assert client.post("/api/v1/chats/direct", headers=reda["headers"], json={"user_id": stranger["user_id"]}).status_code == 404
    chat = client.post("/api/v1/chats/direct", headers=reda["headers"], json={"user_id": kayra["user_id"]}).json()["chat"]
    _send(client, reda, chat["id"], "hoi")
    client.delete(f"/api/v1/friends/{kayra['user_id']}", headers=reda["headers"])
    assert _chats(client, kayra)["chats"] == []
    assert client.post(f"/api/v1/chats/{chat['id']}/messages", headers=kayra["headers"], json={"body": "x"}).status_code == 404
    # Friends again: the same chat, history included
    befriend(client, reda, kayra)
    assert _chats(client, kayra)["chats"][0]["last"]["body"] == "hoi"
    # Somebody else's chat doesn't exist for you
    assert client.get(f"/api/v1/chats/{chat['id']}/messages", headers=stranger["headers"]).status_code == 404


def test_groups(client, mails, three):
    reda, kayra, lotte = three
    r = client.post("/api/v1/chats", headers=reda["headers"], json={"name": "  De   bende ", "user_ids": [kayra["user_id"]]})
    assert r.status_code == 201, r.text
    g = r.json()["chat"]
    assert g["name"] == "De bende" and g["count"] == 2
    # Kayra adds Lotte (a friend of Kayra's); a stranger can't be added
    stranger = login(client, "noor@example.com", mails)
    assert client.post(f"/api/v1/chats/{g['id']}/members", headers=kayra["headers"],
                       json={"user_ids": [stranger["user_id"]]}).status_code == 404
    g = client.post(f"/api/v1/chats/{g['id']}/members", headers=kayra["headers"], json={"user_ids": [lotte["user_id"]]}).json()["chat"]
    assert g["count"] == 3
    _send(client, lotte, g["id"], "ja, cafetaria om half één")
    events = [m["payload"]["type"] for m in client.get(f"/api/v1/chats/{g['id']}/messages", headers=reda["headers"]).json()["messages"]
              if m["kind"] == "event"]
    assert events == ["created", "added"]
    # Rename, pin (only for you), leave
    client.patch(f"/api/v1/chats/{g['id']}", headers=lotte["headers"], json={"name": "Bende", "pinned": True})
    assert _chats(client, reda)["chats"][0]["name"] == "Bende" and not _chats(client, reda)["chats"][0]["pinned"]
    assert _chats(client, lotte)["chats"][0]["pinned"]
    assert client.delete(f"/api/v1/chats/{g['id']}/members/me", headers=lotte["headers"]).status_code == 204
    assert _chats(client, lotte)["chats"] == []
    assert client.get(f"/api/v1/chats/{g['id']}", headers=reda["headers"]).json()["chat"]["count"] == 2
    # A one-to-one chat can't be renamed or left
    d = client.post("/api/v1/chats/direct", headers=reda["headers"], json={"user_id": kayra["user_id"]}).json()["chat"]
    assert client.patch(f"/api/v1/chats/{d['id']}", headers=reda["headers"], json={"name": "x"}).status_code == 400
    assert client.post("/api/v1/chats", headers=reda["headers"], json={"name": " ", "user_ids": [kayra["user_id"]]}).status_code == 400


def test_block_and_report_with_the_moderators(client, three):
    reda, kayra, lotte = three
    g = client.post("/api/v1/chats", headers=reda["headers"],
                    json={"name": "De bende", "user_ids": [kayra["user_id"], lotte["user_id"]]}).json()["chat"]
    bad = _send(client, kayra, g["id"], "iets gemeens")
    _send(client, lotte, g["id"], "hallo")
    # Your own message, or an event, can't be reported
    assert client.post(f"/api/v1/chats/messages/{bad['id']}/report", headers=kayra["headers"],
                       json={"reason": "mean"}).status_code == 400
    r = client.post(f"/api/v1/chats/messages/{bad['id']}/report", headers=reda["headers"],
                    json={"reason": "mean", "note": "al de hele week", "block": True})
    assert r.json() == {"reported": True, "blocked": True}
    # Twice counts once
    client.post(f"/api/v1/chats/messages/{bad['id']}/report", headers=reda["headers"], json={"reason": "mean"})
    # Blocked: Kayra's messages are gone for Reda (also from the unread count), not for Lotte
    assert [m["body"] for m in client.get(f"/api/v1/chats/{g['id']}/messages", headers=reda["headers"]).json()["messages"]
            if m["kind"] == "text"] == ["hallo"]
    assert _chats(client, reda)["unread"] == 1
    assert "iets gemeens" in [m["body"] for m in client.get(f"/api/v1/chats/{g['id']}/messages", headers=lotte["headers"]).json()["messages"]]
    # The moderators see it, with context; removing it removes it for everyone
    ac = TestClient(admin.app)
    assert ac.get("/admin/v1/overview", headers=A).json()["counts"]["open_reports"] == 1
    rep = ac.get("/admin/v1/reports", headers=A).json()["reports"]
    assert len(rep) == 1 and rep[0]["text"] == "iets gemeens" and rep[0]["note"] == "al de hele week"
    assert rep[0]["author"]["id"] == kayra["user_id"] and rep[0]["message"] == "visible"
    out = ac.post(f"/admin/v1/reports/{rep[0]['id']}", headers=A, json={"outcome": "removed"}).json()["report"]
    assert out["outcome"] == "removed" and out["message"] == "removed" and out["text"] == "iets gemeens"
    m = next(m for m in client.get(f"/api/v1/chats/{g['id']}/messages", headers=lotte["headers"]).json()["messages"]
             if m["id"] == bad["id"])
    assert m["removed"] and m["body"] is None
    assert ac.get("/admin/v1/reports", headers=A).json()["reports"] == []


def test_turning_the_writer_off(client, three):
    reda, kayra, _ = three
    d = client.post("/api/v1/chats/direct", headers=reda["headers"], json={"user_id": kayra["user_id"]}).json()["chat"]
    bad = _send(client, kayra, d["id"], "spam spam")
    client.post(f"/api/v1/chats/messages/{bad['id']}/report", headers=reda["headers"], json={"reason": "spam"})
    ac = TestClient(admin.app)
    rid = ac.get("/admin/v1/reports", headers=A).json()["reports"][0]["id"]
    ac.post(f"/admin/v1/reports/{rid}", headers=A, json={"outcome": "disabled"})
    assert client.get("/api/v1/chats", headers=kayra["headers"]).status_code == 401


def test_a_planned_break_shows_up_in_the_chats_they_share(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    lotte = login(client, "lotte@example.com", mails)
    befriend(client, reda, lotte)
    befriend(client, kayra, lotte)
    g = client.post("/api/v1/chats", headers=reda["headers"],
                    json={"name": "x", "user_ids": [kayra["user_id"], lotte["user_id"]]}).json()["chat"]
    b = _ask(client, reda, kayra, mode="meet", place="cafetaria").json()
    d = b["chats"][0]
    client.post(f"/api/v1/breaks/{b['break']['id']}/respond", headers=kayra["headers"], json={"response": "accepted"})
    ev = client.get(f"/api/v1/chats/{g['id']}/messages", headers=reda["headers"]).json()["messages"][-1]
    assert ev["kind"] == "event" and ev["payload"]["type"] == "break_planned"
    assert ev["payload"]["place"] == "cafetaria" and ev["payload"]["start"] == 630
    assert sorted(ev["payload"]["people"]) == sorted([reda["user_id"], kayra["user_id"]])
    # Not in the direct chat: its card already says it
    kinds = [m["kind"] for m in client.get(f"/api/v1/chats/{d}/messages", headers=reda["headers"]).json()["messages"]]
    assert kinds == ["request"]


def test_a_request_card_shows_the_request_as_it_is_now(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    r = _ask(client, reda, kayra).json()
    bid, (d,) = r["break"]["id"], r["chats"]
    url = f"/api/v1/chats/{d}/messages"
    first = client.get(url, headers=kayra["headers"])
    card = first.json()["messages"][-1]
    assert (card["kind"], card["user_id"], card["payload"]) == ("request", reda["user_id"], {"type": "break", "request": bid})
    req = card["request"]
    assert (req["type"], req["id"], req["mine"], req["my_response"], req["state"], req["over"]) == \
        ("break", bid, False, "pending", "pending", False)
    assert client.get(url, headers=reda["headers"]).json()["messages"][-1]["request"]["mine"] is True
    # Open request: the "Verzoek" tag on both sides; it doesn't count as unread
    assert [(c["id"], c["requests"], c["unread"]) for c in _chats(client, kayra)["chats"]] == [(d, 1, 0)]
    assert _chats(client, kayra)["chats"][0]["last"]["request"]["id"] == bid
    assert _chats(client, reda)["chats"][0]["requests"] == 1
    # Answered: the same URL answers with something new (the ETag changes with the request)
    tag = first.headers["etag"]
    assert client.get(url, headers={**kayra["headers"], "X-If-None-Match": tag}).headers.get("x-not-modified") == "1"
    client.post(f"/api/v1/breaks/{bid}/respond", headers=kayra["headers"], json={"response": "accepted"})
    again = client.get(url, headers={**kayra["headers"], "X-If-None-Match": tag})
    assert again.headers.get("x-not-modified") is None and again.headers["etag"] != tag
    assert again.json()["messages"][-1]["request"]["state"] == "planned"
    assert _chats(client, kayra)["chats"][0]["requests"] == 0
    # Taken back: still on the card, as cancelled; a card can't be deleted like a message
    client.post(f"/api/v1/breaks/{bid}/cancel", headers=reda["headers"])
    assert client.get(url, headers=kayra["headers"]).json()["messages"][-1]["request"]["state"] == "cancelled"
    assert client.delete(f"{url}/{card['id']}", headers=reda["headers"]).status_code == 404


def test_deleting_an_account_takes_its_chats(client, three):
    reda, kayra, lotte = three
    d = client.post("/api/v1/chats/direct", headers=reda["headers"], json={"user_id": kayra["user_id"]}).json()["chat"]
    g = client.post("/api/v1/chats", headers=kayra["headers"], json={"name": "x", "user_ids": [reda["user_id"]]}).json()["chat"]
    _send(client, kayra, d["id"], "hoi")
    _send(client, kayra, g["id"], "hoi groep")
    _send(client, reda, g["id"], "hoi terug")
    exported = client.get("/api/v1/me/export", headers=kayra["headers"]).json()
    assert {m["body"] for m in exported["chat_messages"]} == {"hoi", "hoi groep"}
    assert client.delete("/api/v1/me", headers=kayra["headers"]).status_code == 204
    assert db.one("SELECT COUNT(*) AS n FROM chat_messages WHERE body LIKE 'hoi%%' AND body <> 'hoi terug'")["n"] == 0
    assert db.one("SELECT COUNT(*) AS n FROM chats WHERE id=%s", (d["id"],))["n"] == 0
    left = _chats(client, reda)["chats"]
    assert [c["id"] for c in left] == [g["id"]] and left[0]["count"] == 1
