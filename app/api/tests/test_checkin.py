"""Today's plan (PUT /me/checkin): the break part (break_status) and the after-school part (status) change on
their own, Today shows both, and "Ik ben bezig" in the breaks stops friends from sharing or asking for them."""
from .conftest import add_class_lessons, befriend, login, onboard, today


def _put(client, who, **plan):
    r = client.put("/api/v1/me/checkin", headers=who["headers"], json=plan)
    assert r.status_code == 200, r.text
    return r.json()["checkin"]


def test_two_parts_change_on_their_own(client, mails, school):
    reda = login(client, "reda@example.com", mails)
    c = _put(client, reda, break_status="busy")
    assert (c["status"], c["break_status"]) == (None, "busy")
    c = _put(client, reda, status="want_chill")
    assert (c["status"], c["break_status"]) == ("want_chill", "busy")
    c = _put(client, reda, break_status="want_chill")
    assert (c["status"], c["break_status"]) == ("want_chill", "want_chill")
    me = client.get("/api/v1/me/today", headers=reda["headers"]).json()["me"]["checkin"]
    assert (me["status"], me["break_status"]) == ("want_chill", "want_chill") and "since_min" in me and "until_min" in me
    _put(client, reda, status=None)
    assert client.get("/api/v1/me/today", headers=reda["headers"]).json()["me"]["checkin"]["status"] is None
    # Both cleared: no plan at all
    assert _put(client, reda, break_status=None) is None
    assert client.get("/api/v1/me/today", headers=reda["headers"]).json()["me"]["checkin"] is None


def test_busy_in_the_breaks(client, mails, school):
    k1, _ = school["classes"]
    add_class_lessons(k1, [("00:00", "00:01", "Vroeg", "B1"), ("23:58", "23:59", "Laat", "B2")], today())
    reda = login(client, "reda@example.com", mails)
    kayra = login(client, "kayra@example.com", mails)
    onboard(client, reda, school, k1)
    onboard(client, kayra, school, k1)
    befriend(client, reda, kayra)
    t = client.get("/api/v1/me/today", headers=reda["headers"]).json()
    assert [x["id"] for x in t["together"]] == [kayra["user_id"]]
    _put(client, kayra, break_status="busy")
    t = client.get("/api/v1/me/today", headers=reda["headers"]).json()
    assert t["together"] == []
    assert t["board"][0]["status"]["code"] == "break_busy"
    r = client.post("/api/v1/breaks", headers=reda["headers"],
                    json={"to_ids": [kayra["user_id"]], "start": t["now"] + 5, "end": t["now"] + 30})
    assert r.status_code == 400 and r.json()["people"] == [{"id": kayra["user_id"], "reason": "busy"}]
    _put(client, kayra, break_status="want_chill")
    t = client.get("/api/v1/me/today", headers=reda["headers"]).json()
    assert t["board"][0]["status"]["code"] == "wants_to_chill"
