import datetime as dt

from roosters import db

from .conftest import add_class_lessons, befriend, login, onboard, today

H = 60
# Tomorrow, so nothing is "already over" whenever the tests run
DAY = today() + dt.timedelta(days=1)


def _setup(client, mails, school):
    """Reda (class 1): Databases 9-10, DevOps 10-12, Python 12-13. Kayra (class 2): free 10-12. Friends, same campus."""
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


def _week(client, who):
    monday = DAY - dt.timedelta(days=DAY.weekday())
    r = client.get(f"/api/v1/me/schedule?start={monday}&days=7&together=1", headers=who["headers"])
    assert r.status_code == 200, r.text
    return r.json()


def test_skipping_a_double_period_frees_it_for_you_and_your_friends(client, mails, school):
    reda, kayra = _setup(client, mails, school)
    assert DAY.isoformat() not in _week(client, reda).get("together", {})

    # The double period (two lessons) in one go
    r = client.put("/api/v1/me/skips", headers=reda["headers"],
                   json={"day": DAY.isoformat(), "start": 10 * H, "end": 12 * H, "course": "DevOps"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["skips"] == [{"course": "DevOps", "start": 10 * H, "end": 12 * H}]
    assert [(t["start"], t["end"]) for t in body["together"]] == [(10 * H, 12 * H)]

    # Your own timetable: still there, marked skipped and not busy
    mine = [l for l in _week(client, reda)["lessons"] if l["course"] == "DevOps"]
    assert len(mine) == 2 and all(l["skipped"] and not l["busy"] for l in mine)
    # Kayra sees the break too, and never that it was skipped
    assert [(t["start"], t["end"]) for t in _week(client, kayra)["together"][DAY.isoformat()]] == [(10 * H, 12 * H)]
    theirs = client.get(f"/api/v1/friends/{reda['user_id']}/schedule?start={DAY}&days=1", headers=kayra["headers"]).json()
    assert [l["course"] for l in theirs["lessons"]] == ["Databases", "Python"]
    assert all("skipped" not in l for l in theirs["lessons"])

    # Undo: busy again, no shared break
    r = client.put("/api/v1/me/skips", headers=reda["headers"],
                   json={"day": DAY.isoformat(), "start": 10 * H, "end": 12 * H, "course": "DevOps", "skipped": False})
    assert r.status_code == 200, r.text
    assert r.json()["skips"] == [] and r.json()["together"] == []
    assert not any(l.get("skipped") for l in _week(client, reda)["lessons"])


def test_skip_needs_a_lesson_of_yours_today_or_later(client, mails, school):
    reda, _ = _setup(client, mails, school)
    h = reda["headers"]
    r = client.put("/api/v1/me/skips", headers=h, json={"day": DAY.isoformat(), "start": 10 * H, "end": 12 * H, "course": "Art"})
    assert r.status_code == 404 and r.json()["code"] == "skip_unknown"
    past = (today() - dt.timedelta(days=1)).isoformat()
    r = client.put("/api/v1/me/skips", headers=h, json={"day": past, "start": 10 * H, "end": 12 * H, "course": "DevOps"})
    assert r.status_code == 400 and r.json()["code"] == "skip_day"


def test_skips_go_with_the_account(client, mails, school):
    reda, _ = _setup(client, mails, school)
    client.put("/api/v1/me/skips", headers=reda["headers"],
               json={"day": DAY.isoformat(), "start": 9 * H, "end": 10 * H, "course": "Databases"})
    assert client.get("/api/v1/me/export", headers=reda["headers"]).json()["skipped_lessons"][0]["course"] == "Databases"
    assert client.delete("/api/v1/me", headers=reda["headers"]).status_code == 204
    assert db.rows("SELECT * FROM skipped_lessons") == []
