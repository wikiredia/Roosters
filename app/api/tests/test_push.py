"""Push: tokens per session, Meldingen, the texts, who gets a push for a break request or a chat message, quiet
hours, and what happens when Expo says a phone is gone or can't be reached."""
import datetime as dt

import pytest

from roosters import config, db, jobs, push
from roosters.schedule import local_now

from .conftest import login, run_jobs
from .test_breaks import DAY, _ask, _setup
from .test_chat import _send, three  # noqa: F401 (fixture)

TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]"
TOKEN_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]"
TODAY = dt.date(2026, 10, 27)


@pytest.fixture
def expo(monkeypatch):
    """Expo, as far as the tests are concerned: every message gets an ok ticket, unless `answer` says otherwise."""
    state = {"sent": [], "receipts": [], "answer": None}

    def post(url, body):
        if url == push.RECEIPTS_URL:
            state["receipts"].append(body)
            return {"data": {i: {"status": "error", "details": {"error": "DeviceNotRegistered"}} for i in body["ids"]}}
        if isinstance(state["answer"], Exception):
            raise state["answer"]
        state["sent"].extend(body)
        return state["answer"] or {"data": [{"status": "ok", "id": f"t{len(state['sent'])}-{i}"} for i in range(len(body))]}

    monkeypatch.setattr(config, "PUSH_MODE", "expo")
    monkeypatch.setattr(push, "_post", post)
    return state


def _pushes(limit: int = 50) -> int:
    """Runs the push jobs only (onboarding also queues course scans, which would ask the real Untis)."""
    db.run("DELETE FROM jobs WHERE kind NOT LIKE 'push%%' AND status IN ('queued','running')")
    return run_jobs(limit)


def _token(client, who, token=TOKEN_A):
    r = client.put("/api/v1/me/push-token", headers=who["headers"], json={"token": token})
    assert r.status_code == 204, r.text


# ---- Pure parts --------------------------------------------------------------------

def test_tokens_and_quiet_hours():
    assert push.valid_token(TOKEN_A) and push.valid_token("ExpoPushToken[xxxxxxxxxxxx]")
    assert not push.valid_token("ExponentPushToken[]") and not push.valid_token("hello") and not push.valid_token(None)
    night = {"quiet_from": 22 * 60, "quiet_until": 7 * 60 + 30}
    assert push.quiet(night, 23 * 60) and push.quiet(night, 3 * 60) and not push.quiet(night, 12 * 60)
    assert not push.quiet(night, 7 * 60 + 30) and push.quiet(night, 22 * 60)
    lunch = {"quiet_from": 12 * 60, "quiet_until": 13 * 60}
    assert push.quiet(lunch, 12 * 60 + 30) and not push.quiet(lunch, 13 * 60)
    assert not push.quiet(push.DEFAULTS, 0)


def test_break_texts():
    p = {"start": 750, "response": "accepted"}
    assert push.break_text("break_request", p, TODAY, "Lotte", "nl", TODAY) == (
        "Pauze samen?", "Lotte wil pauze met jou om 12:30. Kan jij?")
    assert push.break_text("break_request", p, TODAY + dt.timedelta(days=1), "Lotte", "en", TODAY)[1] == (
        "Lotte wants a break with you tomorrow at 12:30. Can you?")
    assert push.break_text("break_counter", p, TODAY + dt.timedelta(days=3), "Lotte", "nl", TODAY)[1] == (
        "Lotte stelt op vr 30/10 om 12:30 voor. Kan jij?")
    assert push.break_text("break_answer", p, TODAY, "Amir", "nl", TODAY) == ("Pauze gepland", "Amir kan om 12:30.")
    no = {"start": 750, "response": "declined", "was": "accepted"}
    assert push.break_text("break_answer", no, TODAY, "Amir", "en", TODAY)[1] == "Amir can't make it at 12:30 after all."
    assert push.break_text("break_cancelled", p, TODAY, "Amir", "nl", TODAY)[1] == "Amir zegt de pauze om 12:30 af."


def test_change_texts():
    tomorrow = (TODAY + dt.timedelta(days=1)).isoformat()
    moved = {"type": "changed", "day": tomorrow, "course": "Databases", "start_min": 780, "end_min": 870,
             "location": "C102", "old": {"day": tomorrow, "start_min": 630, "location": "B204"}}
    assert push.change_text([moved], "nl", TODAY) == (
        "Roosterwijziging morgen", "Databases verplaatst: 10:30 → 13:00, B204 → C102.")
    gone = {"type": "cancelled", "day": TODAY.isoformat(), "course": "DevOps", "start_min": 540, "end_min": 600}
    assert push.change_text([gone], "en", TODAY) == ("Timetable change today", "DevOps is cancelled (9:00).")
    several = push.change_text([moved, dict(gone, day=tomorrow), dict(moved, type="new", course="Python")], "nl", TODAY)
    assert several == ("3 roosterwijzigingen morgen", "Databases verplaatst · DevOps vervalt · Python extra")


def test_chat_texts():
    assert push.chat_text("direct", None, "Kayra", "koffie?") == ("Kayra", "koffie?")
    assert push.chat_text("group", "De bende", "Kayra", "koffie?") == ("De bende", "Kayra: koffie?")
    assert push.chat_text("direct", None, "Kayra", "x" * 500)[1].endswith("…")


def test_build_groups_changes_of_a_day():
    day = (TODAY + dt.timedelta(days=1)).isoformat()
    ch = {"type": "cancelled", "day": day, "course": "DevOps", "start_min": 540, "end_min": 600}
    notes = [{"kind": "schedule_change", "payload": ch, "day": None},
             {"kind": "schedule_change", "payload": dict(ch, course="Databases"), "day": None},
             {"kind": "break_request", "payload": {"from": 7, "start": 750, "request": 3}, "day": TODAY}]
    out = push.build(notes, {7: "Lotte"}, "nl", TODAY)
    assert [m["channelId"] for m in out] == ["requests", "changes"]
    assert out[0]["categoryId"] == "break_request" and out[0]["data"]["request"] == 3
    assert out[1]["title"] == "2 roosterwijzigingen morgen" and out[1]["collapseId"] == f"changes-{day}"


# ---- Tokens and settings -----------------------------------------------------------

def test_token_belongs_to_the_session(client, mails):
    reda = login(client, "reda@example.com", mails)
    assert client.put("/api/v1/me/push-token", headers=reda["headers"], json={"token": "nope-not-a-token"}).json()[
        "code"] == "push_token"
    _token(client, reda)
    assert client.get("/api/v1/me/push", headers=reda["headers"]).json()["device"] is True
    assert push.tokens_of(reda["user_id"]) == [TOKEN_A]
    # Kayra signs in on the same phone: the token goes with her
    kayra = login(client, "kayra@example.com", mails)
    _token(client, kayra)
    assert push.tokens_of(reda["user_id"]) == [] and push.tokens_of(kayra["user_id"]) == [TOKEN_A]
    # Signing out: no more push to that phone
    client.post("/api/v1/auth/logout", headers=kayra["headers"])
    assert push.tokens_of(kayra["user_id"]) == []
    second = login(client, "reda@example.com", mails)
    _token(client, second, TOKEN_B)
    assert client.delete("/api/v1/me/push-token", headers=second["headers"]).status_code == 204
    assert push.tokens_of(reda["user_id"]) == []


def test_settings(client, mails):
    reda = login(client, "reda@example.com", mails)
    s = client.get("/api/v1/me/push", headers=reda["headers"]).json()
    assert s == {"settings": push.DEFAULTS, "device": False}
    r = client.patch("/api/v1/me/push", headers=reda["headers"], json={"changes": False, "quiet_from": 1320, "quiet_until": 450})
    assert r.json()["settings"] == {"requests": True, "changes": False, "chat": True, "quiet_from": 1320, "quiet_until": 450}
    # Only one end of the quiet hours doesn't make sense
    assert client.patch("/api/v1/me/push", headers=reda["headers"], json={"quiet_from": None}).status_code == 400
    r = client.patch("/api/v1/me/push", headers=reda["headers"], json={"quiet_from": None, "quiet_until": None})
    assert r.json()["settings"]["quiet_from"] is None and r.json()["settings"]["changes"] is False
    assert client.get("/api/v1/me/export", headers=reda["headers"]).json()["push_settings"]["changes"] is False
    assert client.delete("/api/v1/me", headers=reda["headers"]).status_code == 204
    assert db.one("SELECT 1 AS x FROM push_settings WHERE user_id=%s", (reda["user_id"],)) is None


# ---- Break requests ----------------------------------------------------------------

def test_break_request_is_pushed_once(client, mails, school, expo):
    reda, kayra = _setup(client, mails, school)
    _token(client, kayra)
    b = _ask(client, reda, kayra).json()["break"]
    _pushes()
    assert len(expo["sent"]) == 1
    m = expo["sent"][0]
    assert m["to"] == TOKEN_A and m["title"] == "Pauze samen?" and m["categoryId"] == "break_request"
    assert m["body"] == "reda wil pauze met jou morgen om 10:30. Kan jij?" and m["data"]["request"] == b["id"]
    # Nothing new: nothing sent again
    jobs.enqueue("push", {"user_id": kayra["user_id"]})
    _pushes()
    assert len(expo["sent"]) == 1
    # Reda has no phone registered: the yes is only in the app
    client.post(f"/api/v1/breaks/{b['id']}/respond", headers=kayra["headers"], json={"response": "accepted"})
    _pushes()
    assert len(expo["sent"]) == 1


def test_categories_and_quiet_hours(client, mails, school, expo):
    reda, kayra = _setup(client, mails, school)
    _token(client, kayra)
    client.patch("/api/v1/me/push", headers=kayra["headers"], json={"requests": False})
    first = _ask(client, reda, kayra).json()["break"]
    _pushes()
    assert expo["sent"] == []
    # Turning it back on doesn't bring the old one back
    client.patch("/api/v1/me/push", headers=kayra["headers"], json={"requests": True})
    _pushes()
    assert expo["sent"] == []
    now = local_now({})
    m = now.hour * 60 + now.minute
    client.patch("/api/v1/me/push", headers=kayra["headers"], json={"quiet_from": (m - 30) % 1440, "quiet_until": (m + 30) % 1440})
    client.post(f"/api/v1/breaks/{first['id']}/cancel", headers=reda["headers"])
    _ask(client, reda, kayra, start=660)
    _pushes()
    assert expo["sent"] == []
    # The notification is still there in the app
    kinds = [n["kind"] for n in client.get("/api/v1/me/notifications", headers=kayra["headers"]).json()["notifications"]]
    assert kinds.count("break_request") == 2


def test_gone_phone_and_unreachable_expo(client, mails, school, expo):
    reda, kayra = _setup(client, mails, school)
    _token(client, kayra)
    expo["answer"] = jobs.Retry("Expo push not reachable")
    _ask(client, reda, kayra)
    _pushes(1)
    assert expo["sent"] == []
    assert db.one("SELECT push_sent_at FROM notifications WHERE user_id=%s", (kayra["user_id"],))["push_sent_at"] is None
    # Expo is back, and says this phone is gone
    expo["answer"] = {"data": [{"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}}]}
    db.run("UPDATE jobs SET run_at=UTC_TIMESTAMP() WHERE status='queued'")
    _pushes()
    assert len(expo["sent"]) == 1 and push.tokens_of(kayra["user_id"]) == []


def test_receipts_forget_a_gone_phone(client, mails, expo):
    reda = login(client, "reda@example.com", mails)
    _token(client, reda)
    assert push.send_test(reda["user_id"], "nl") == 1
    job = db.one("SELECT * FROM jobs WHERE kind='push_receipts'")
    assert job["run_at"] > db.utcnow() + dt.timedelta(minutes=10)
    db.run("UPDATE jobs SET run_at=UTC_TIMESTAMP() WHERE id=%s", (job["id"],))
    _pushes()
    assert expo["receipts"] and push.tokens_of(reda["user_id"]) == []


# ---- Chat --------------------------------------------------------------------------

def test_chat_only_with_the_bell_on(client, three, expo):  # noqa: F811
    reda, kayra, lotte = three
    chat = client.post("/api/v1/chats/direct", headers=reda["headers"], json={"user_id": kayra["user_id"]}).json()["chat"]
    assert chat["push"] is False
    _token(client, kayra)
    _send(client, reda, chat["id"], "koffie?")
    _pushes()
    assert expo["sent"] == []
    r = client.patch(f"/api/v1/chats/{chat['id']}", headers=kayra["headers"], json={"push": True})
    assert r.json()["chat"]["push"] is True
    assert client.get(f"/api/v1/chats/{chat['id']}", headers=reda["headers"]).json()["chat"]["push"] is False
    _send(client, reda, chat["id"], "B-blok?")
    # Your own message never comes back to you
    _send(client, kayra, chat["id"], "ok!")
    _pushes()
    assert [(m["title"], m["body"], m["threadId"]) for m in expo["sent"]] == [("reda", "B-blok?", f"chat-{chat['id']}")]
    assert expo["sent"][0]["data"]["url"] == f"/chat/{chat['id']}"
    # Chat off in Meldingen: no bell helps
    client.patch("/api/v1/me/push", headers=kayra["headers"], json={"chat": False})
    _send(client, reda, chat["id"], "hallo?")
    _pushes()
    assert len(expo["sent"]) == 1


def test_group_chat_and_blocking(client, three, expo):  # noqa: F811
    reda, kayra, lotte = three
    g = client.post("/api/v1/chats", headers=reda["headers"],
                    json={"name": "De bende", "user_ids": [kayra["user_id"], lotte["user_id"]]}).json()["chat"]
    for who, token in ((kayra, TOKEN_A), (lotte, TOKEN_B)):
        _token(client, who, token)
        client.patch(f"/api/v1/chats/{g['id']}", headers=who["headers"], json={"push": True})
    client.post("/api/v1/blocks", headers=lotte["headers"], json={"user_id": reda["user_id"]})
    _send(client, reda, g["id"], "Wie gaat mee?")
    _pushes()
    assert [(m["to"], m["title"], m["body"]) for m in expo["sent"]] == [(TOKEN_A, "De bende", "reda: Wie gaat mee?")]


def test_message_taken_back_before_the_push(client, three, expo):  # noqa: F811
    reda, kayra, _ = three
    chat = client.post("/api/v1/chats/direct", headers=reda["headers"], json={"user_id": kayra["user_id"]}).json()["chat"]
    _token(client, kayra)
    client.patch(f"/api/v1/chats/{chat['id']}", headers=kayra["headers"], json={"push": True})
    m = _send(client, reda, chat["id"], "oeps")
    client.delete(f"/api/v1/chats/{chat['id']}/messages/{m['id']}", headers=reda["headers"])
    _pushes()
    assert expo["sent"] == []


def test_day_is_tomorrow():
    # The break tests ask for tomorrow; the texts above rely on that
    assert DAY == local_now({}).date() + dt.timedelta(days=1)
