"""Skip questions ("Volg je Python?"): asking a friend whether they'd skip a class so you share a break, the card in
your chat, the push text, what yes / no / taking it back do, and that the course stays theirs to tell."""
import datetime as dt

from roosters import db, push

from .conftest import add_class_lessons, befriend, login, onboard, today

H = 60
DAY = today() + dt.timedelta(days=1)


def _setup(client, mails, school):
    """Reda (class 1): Databases 9-10, DevOps 10-12, Python 12-13. Kayra (class 2): Cloud 9-10, free 10-12, Cloud
    12-14. Kayra asks Reda about DevOps: then they share 10-12."""
    k1, k2 = school["classes"]
    db.run("UPDATE school_classes SET last_ok=UTC_TIMESTAMP()")
    add_class_lessons(k1, [("09:00", "10:00", "Databases", "B204"), ("10:00", "11:00", "DevOps", "C102"),
                           ("11:00", "12:00", "DevOps", "C102"), ("12:00", "13:00", "Python", "A1")], DAY)
    add_class_lessons(k2, [("09:00", "10:00", "Cloud", "B204"), ("12:00", "14:00", "Cloud", "B204")], DAY)
    reda = login(client, "reda@student.ap.be", mails)
    kayra = login(client, "kayra@student.ap.be", mails)
    onboard(client, reda, school, k1)
    onboard(client, kayra, school, k2)
    befriend(client, reda, kayra)
    return reda, kayra


def _ask(client, who, to, start=10 * H, end=12 * H, day=DAY):
    return client.post(f"/api/v1/friends/{to['user_id']}/skip-request", headers=who["headers"],
                       json={"day": day.isoformat(), "start": start, "end": end})


def _together(client, who):
    r = client.get(f"/api/v1/me/schedule?start={DAY}&days=1&together=1", headers=who["headers"]).json()
    return [(t["start"], t["end"]) for t in r.get("together", {}).get(DAY.isoformat(), [])]


def test_ask_and_accept(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    r = _ask(client, kayra, reda)
    assert r.status_code == 201, r.text
    s, chat_id = r.json()["skip"], r.json()["chat_id"]
    assert (s["type"], s["mine"], s["status"], s["minutes"]) == ("skip", True, "pending", 2 * H)
    assert (s["from"]["id"], s["to"]["id"], s["start"], s["end"]) == (kayra["user_id"], reda["user_id"], 10 * H, 12 * H)
    # Reda shows Kayra everything: she may know it's DevOps
    assert s["course"] == "DevOps"
    # Open for both, and nothing changed yet: Reda still goes, no shared break
    assert [x["id"] for x in client.get("/api/v1/skip-requests", headers=kayra["headers"]).json()["skips"]] == [s["id"]]
    mine = client.get("/api/v1/skip-requests", headers=reda["headers"]).json()["skips"]
    assert [(x["id"], x["mine"]) for x in mine] == [(s["id"], False)]
    assert _together(client, reda) == [] and _together(client, kayra) == []
    # The card in their chat, the notification and its push
    card = client.get(f"/api/v1/chats/{chat_id}/messages", headers=reda["headers"]).json()["messages"][-1]
    assert card["payload"] == {"type": "skip", "request": s["id"]} and card["request"]["course"] == "DevOps"
    note = next(n for n in client.get("/api/v1/me/notifications", headers=reda["headers"]).json()["notifications"]
                if n["kind"] == "skip_request")
    assert note["payload"]["minutes"] == 2 * H and note["day"] == DAY.isoformat()
    title, body = push.skip_text("skip_request", note["payload"], DAY, "Kayra", "nl", today())
    assert title == "Volg je DevOps?" and "Kayra vraagt of je DevOps volgt morgen om 10:00" in body and "2 uren" in body
    # Asking again about the same time
    assert _ask(client, kayra, reda, 11 * H, 12 * H).json()["code"] == "skip_ask_dup"
    # Only Reda answers
    assert client.post(f"/api/v1/skip-requests/{s['id']}/accept", headers=kayra["headers"]).status_code == 404
    r = client.post(f"/api/v1/skip-requests/{s['id']}/accept", headers=reda["headers"])
    assert r.status_code == 200 and r.json()["skip"]["status"] == "accepted"
    # Now it's Reda's own skip: both see the break
    assert _together(client, reda) == [(10 * H, 12 * H)] and _together(client, kayra) == [(10 * H, 12 * H)]
    devops = [l for l in client.get(f"/api/v1/me/schedule?start={DAY}&days=1", headers=reda["headers"]).json()["lessons"]
              if l["course"] == "DevOps"]
    assert devops and all(l["skipped"] for l in devops)
    answer = next(n for n in client.get("/api/v1/me/notifications", headers=kayra["headers"]).json()["notifications"]
                  if n["kind"] == "skip_answer")
    assert answer["payload"]["response"] == "accepted" and answer["payload"]["chat"] == chat_id
    assert "course" not in answer["payload"]
    assert client.get("/api/v1/skip-requests", headers=kayra["headers"]).json()["skips"] == []


def test_decline_cancel_and_rules(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    s = _ask(client, kayra, reda).json()["skip"]
    assert client.post(f"/api/v1/skip-requests/{s['id']}/decline", headers=reda["headers"]).json()["skip"]["status"] == "declined"
    assert _together(client, reda) == []
    s = _ask(client, kayra, reda).json()["skip"]
    assert client.post(f"/api/v1/skip-requests/{s['id']}/cancel", headers=reda["headers"]).status_code == 404
    assert client.post(f"/api/v1/skip-requests/{s['id']}/cancel", headers=kayra["headers"]).json()["skip"]["status"] == "cancelled"
    # Nothing of Reda's there, or skipping it gives no shared break (Kayra has Cloud 12-13 too)
    assert _ask(client, kayra, reda, 14 * H, 15 * H).json()["code"] == "skip_unknown"
    assert _ask(client, kayra, reda, 12 * H, 13 * H).json()["code"] == "skip_ask_nothing"
    # Over, or not a friend
    assert _ask(client, kayra, reda, day=today() - dt.timedelta(days=1)).json()["code"] in ("skip_day", "skip_unknown")
    noor = login(client, "noor@student.ap.be", mails)
    assert _ask(client, noor, reda).status_code == 404


def test_course_stays_theirs(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    # Reda only shows Kayra when they're free
    client.patch(f"/api/v1/friends/{kayra['user_id']}", headers=reda["headers"], json={"visibility": "freebusy"})
    s = _ask(client, kayra, reda).json()["skip"]
    assert s["course"] is None
    assert client.get("/api/v1/skip-requests", headers=kayra["headers"]).json()["skips"][0]["course"] is None
    # Reda, asked, does see it
    assert client.get("/api/v1/skip-requests", headers=reda["headers"]).json()["skips"][0]["course"] == "DevOps"


def test_unfriending_and_deleting(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    s = _ask(client, kayra, reda).json()["skip"]
    client.delete(f"/api/v1/friends/{reda['user_id']}", headers=kayra["headers"])
    assert client.get("/api/v1/skip-requests", headers=reda["headers"]).json()["skips"] == []
    assert client.post(f"/api/v1/skip-requests/{s['id']}/accept", headers=reda["headers"]).status_code == 404
    assert client.delete("/api/v1/me", headers=kayra["headers"]).status_code == 204
    assert db.one("SELECT COUNT(*) AS n FROM skip_requests")["n"] == 0
