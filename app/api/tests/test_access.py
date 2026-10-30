"""Access requests ("Mag ik je rooster zien?"): asking a friend to show you more, the card in your chat, accepting,
declining, taking it back, and what unfriending and deleting an account do with them."""
from roosters import db
from roosters.access import has_enough

from .conftest import befriend, login


def _pair(client, mails):
    reda, kayra = (login(client, f"{n}@example.com", mails) for n in ("reda", "kayra"))
    befriend(client, reda, kayra)
    # Kayra shows Reda only free/busy
    client.patch(f"/api/v1/friends/{reda['user_id']}", headers=kayra["headers"], json={"visibility": "freebusy"})
    return reda, kayra


def _ask(client, who, to, visibility="full"):
    return client.post(f"/api/v1/friends/{to['user_id']}/access", headers=who["headers"], json={"visibility": visibility})


def _shows(client, me, friend):
    """What `friend` shows `me`."""
    return next(f for f in client.get("/api/v1/friends", headers=me["headers"]).json()["friends"]
                if f["id"] == friend["user_id"])["visibility"]


def test_levels():
    assert has_enough("full", "norooms") and has_enough("norooms", "norooms")
    assert not has_enough("freebusy", "norooms") and not has_enough("norooms", "full")


def test_ask_and_accept(client, mails):
    reda, kayra = _pair(client, mails)
    r = _ask(client, reda, kayra, "norooms")
    assert r.status_code == 201, r.text
    a, chat_id = r.json()["access"], r.json()["chat_id"]
    assert (a["type"], a["mine"], a["visibility"], a["status"]) == ("access", True, "norooms", "pending")
    assert (a["from"]["id"], a["to"]["id"]) == (reda["user_id"], kayra["user_id"])
    # The card in their direct chat, and the "Verzoek" tag for both
    d = client.post("/api/v1/chats/direct", headers=kayra["headers"], json={"user_id": reda["user_id"]}).json()["chat"]
    assert d["id"] == chat_id
    card = client.get(f"/api/v1/chats/{chat_id}/messages", headers=kayra["headers"]).json()["messages"][-1]
    assert card["payload"] == {"type": "access", "request": a["id"]} and card["request"]["mine"] is False
    assert client.get("/api/v1/chats", headers=kayra["headers"]).json()["chats"][0]["requests"] == 1
    assert client.get("/api/v1/chats", headers=reda["headers"]).json()["chats"][0]["requests"] == 1
    note = next(n for n in client.get("/api/v1/me/notifications", headers=kayra["headers"]).json()["notifications"]
                if n["kind"] == "access_request")
    assert note["payload"] == {"request": a["id"], "from": reda["user_id"], "visibility": "norooms", "chat": chat_id}
    # Asking twice, or for what they already show you
    assert _ask(client, reda, kayra, "full").json()["code"] == "access_dup"
    assert _ask(client, kayra, reda).json()["code"] == "access_has"
    # Only Kayra can accept
    assert client.post(f"/api/v1/access/{a['id']}/accept", headers=reda["headers"]).status_code == 404
    r = client.post(f"/api/v1/access/{a['id']}/accept", headers=kayra["headers"])
    assert r.status_code == 200 and r.json()["access"]["status"] == "accepted"
    assert _shows(client, reda, kayra) == "norooms"
    assert client.get("/api/v1/chats", headers=kayra["headers"]).json()["chats"][0]["requests"] == 0
    answer = next(n for n in client.get("/api/v1/me/notifications", headers=reda["headers"]).json()["notifications"]
                  if n["kind"] == "access_answer")
    assert answer["payload"]["response"] == "accepted" and answer["payload"]["chat"] == chat_id
    # Already decided: nothing to answer any more
    assert client.post(f"/api/v1/access/{a['id']}/decline", headers=kayra["headers"]).status_code == 404
    assert _ask(client, reda, kayra, "norooms").json()["code"] == "access_has"


def test_decline_and_cancel(client, mails):
    reda, kayra = _pair(client, mails)
    a = _ask(client, reda, kayra).json()["access"]
    assert client.post(f"/api/v1/access/{a['id']}/decline", headers=kayra["headers"]).json()["access"]["status"] == "declined"
    assert _shows(client, reda, kayra) == "freebusy"
    b = _ask(client, reda, kayra).json()["access"]
    assert client.post(f"/api/v1/access/{b['id']}/cancel", headers=kayra["headers"]).status_code == 404
    assert client.post(f"/api/v1/access/{b['id']}/cancel", headers=reda["headers"]).json()["access"]["status"] == "cancelled"
    # Only friends
    noor = login(client, "noor@example.com", mails)
    assert _ask(client, reda, noor).status_code == 404


def test_unfriending_and_deleting(client, mails):
    reda, kayra = _pair(client, mails)
    a = _ask(client, reda, kayra).json()["access"]
    client.delete(f"/api/v1/friends/{reda['user_id']}", headers=kayra["headers"])
    befriend(client, reda, kayra)
    # Friends again: the old one was cancelled, so it can't be accepted, and asking again works
    assert client.post(f"/api/v1/access/{a['id']}/accept", headers=kayra["headers"]).status_code == 404
    assert _ask(client, reda, kayra, "full").status_code == 400  # a new friendship shows full by default
    client.patch(f"/api/v1/friends/{reda['user_id']}", headers=kayra["headers"], json={"visibility": "freebusy"})
    assert _ask(client, reda, kayra).status_code == 201
    exported = client.get("/api/v1/me/export", headers=reda["headers"]).json()["access_requests"]
    assert len(exported) == 2
    assert client.delete("/api/v1/me", headers=reda["headers"]).status_code == 204
    assert db.one("SELECT COUNT(*) AS n FROM access_requests")["n"] == 0
