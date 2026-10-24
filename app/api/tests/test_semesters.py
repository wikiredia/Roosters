"""Semesters: classes per semester, the course list of the whole school year, and sources for one semester."""
import datetime as dt

from roosters import db, sync, untis

from .conftest import add_class_lessons, login, run_jobs, today
from .test_sync import untis_week


def _semesters_around_today(school_id: int) -> tuple[dt.date, dt.date]:
    """Today is in S1, which started 30 days ago; S2 starts in 30 days and ends in 120."""
    t = today()
    s2, end = t + dt.timedelta(days=30), t + dt.timedelta(days=120)
    db.run("UPDATE schools SET year_start=%s, s2_start=%s, year_end=%s WHERE id=%s",
           ((t - dt.timedelta(days=30)).strftime("%m-%d"), s2.strftime("%m-%d"), end.strftime("%m-%d"), school_id))
    return s2, end


def _setup(client, mails, school):
    u = login(client, "reda@example.com", mails)
    r = client.patch("/api/v1/me", headers=u["headers"], json={"school_id": school["id"], "onboarded": True})
    assert r.status_code == 200, r.text
    return u


def test_classes_come_with_their_semesters_and_the_school_year(client, mails, school):
    _semesters_around_today(school["id"])
    db.run("UPDATE school_classes SET in_s1=0 WHERE id=%s", (school["classes"][1],))
    u = _setup(client, mails, school)
    body = client.get(f"/api/v1/schools/{school['id']}/classes", headers=u["headers"]).json()
    by_id = {c["id"]: c for c in body["classes"]}
    assert by_id[school["classes"][0]]["semesters"] == [1, 2]
    assert by_id[school["classes"][1]]["semesters"] == [2]
    assert body["terms"]["current"] == 1


def test_refresh_classes_asks_untis_once_per_semester(school, monkeypatch):
    s2, _ = _semesters_around_today(school["id"])
    asked = []

    def list_classes(server, login, day=None):
        asked.append(day)
        both = [{"untis_id": 10220, "name": "2ITCSC1a", "long_name": ""}]
        if day >= s2:
            return both + [{"untis_id": 30000, "name": "2ITCSC2a", "long_name": ""}]
        return both + [{"untis_id": 10187, "name": "1IT7", "long_name": ""}]
    monkeypatch.setattr(untis, "list_classes", list_classes)
    assert sync.refresh_classes(school["id"]) == 3
    assert asked[0] == today() and asked[1] >= s2
    flags = {r["name"]: (r["in_s1"], r["in_s2"]) for r in db.rows(
        "SELECT name, in_s1, in_s2 FROM school_classes WHERE school_id=%s AND active=1", (school["id"],))}
    assert flags == {"2ITCSC1a": (1, 1), "1IT7": (1, 0), "2ITCSC2a": (0, 1)}


def test_courses_of_the_whole_year_per_semester(client, mails, school, monkeypatch):
    s2, _ = _semesters_around_today(school["id"])
    k = school["classes"][0]
    add_class_lessons(k, [("08:30", "10:30", "Databases", "B204")])
    u = _setup(client, mails, school)
    url = f"/api/v1/schools/{school['id']}/classes/{k}/courses"

    # Before the scan: what the near weeks have, and the app is told to ask again
    body = client.get(url, headers=u["headers"]).json()
    assert body["scanning"] is True
    assert [c["name"] for c in body["courses"]] == ["Databases"]

    # Python only starts in S2, far beyond the weeks the normal sync fetches
    def fetch_week(server, login, class_id, monday):
        if monday + dt.timedelta(days=6) < s2:
            periods = [{"id": 1, "start": 830, "end": 1030, "subject": "Databases"}]
            return untis.parse_week(untis_week(class_id, monday, periods), class_id)
        day = max(monday, s2)
        periods = [{"id": 2, "start": 1100, "end": 1230, "subject": "Python Advanced"}]
        return untis.parse_week(untis_week(class_id, day, periods), class_id)
    monkeypatch.setattr(untis, "fetch_week", fetch_week)
    run_jobs()
    assert db.one("SELECT courses_scanned_at FROM school_classes WHERE id=%s", (k,))["courses_scanned_at"]

    body = client.get(url, headers=u["headers"]).json()
    assert body["scanning"] is False
    assert {c["name"]: c["semesters"] for c in body["courses"]} == {"Databases": [1], "Python Advanced": [2]}
    s2_only = client.get(url, headers=u["headers"], params={"semester": 2}).json()["courses"]
    assert [c["name"] for c in s2_only] == ["Python Advanced"]


def test_a_failing_scan_is_retried_and_stops_the_polling(client, mails, school, monkeypatch):
    _semesters_around_today(school["id"])
    k = school["classes"][0]
    u = _setup(client, mails, school)

    def broken(*a, **kw):
        raise untis.UntisError("Untis answered with status 503")
    monkeypatch.setattr(untis, "fetch_week", broken)
    client.get(f"/api/v1/schools/{school['id']}/classes/{k}/courses", headers=u["headers"])
    run_jobs()
    body = client.get(f"/api/v1/schools/{school['id']}/classes/{k}/courses", headers=u["headers"]).json()
    assert body["scanning"] is False and "503" in body["error"]
    job = db.one("SELECT status FROM jobs WHERE kind='scan_courses'")
    assert job["status"] == "queued"


def test_a_class_per_semester_is_its_own_source(client, mails, school):
    _semesters_around_today(school["id"])
    k = school["classes"][0]
    u = _setup(client, mails, school)
    h = u["headers"]
    r1 = client.post("/api/v1/me/sources/untis", headers=h, json={"class_id": k, "semester": 1})
    r2 = client.post("/api/v1/me/sources/untis", headers=h, json={"class_id": k, "semester": 2})
    assert r1.status_code == r2.status_code == 201
    assert (r1.json()["source"]["semester"], r2.json()["source"]["semester"]) == (1, 2)
    assert client.post("/api/v1/me/sources/untis", headers=h, json={"class_id": k, "semester": 2}).status_code == 409
    assert client.post("/api/v1/me/sources/untis", headers=h, json={"class_id": k}).status_code == 409


def test_a_class_for_s2_only_is_not_in_your_s1_timetable(client, mails, school):
    s2, _ = _semesters_around_today(school["id"])
    k1, k2 = school["classes"]
    add_class_lessons(k1, [("08:30", "10:30", "Databases", "B204")])
    add_class_lessons(k2, [("11:00", "12:30", "Python Advanced", "C102")])
    add_class_lessons(k2, [("11:00", "12:30", "Python Advanced", "C102")], day=s2)
    db.run("UPDATE school_classes SET last_ok=UTC_TIMESTAMP()")
    u = _setup(client, mails, school)
    h = u["headers"]
    client.post("/api/v1/me/sources/untis", headers=h, json={"class_id": k1, "semester": 1})
    client.post("/api/v1/me/sources/untis", headers=h, json={"class_id": k2, "semester": 2})
    now = client.get("/api/v1/me/schedule", headers=h, params={"start": today().isoformat(), "days": 1}).json()
    assert [l["course"] for l in now["lessons"]] == ["Databases"]
    later = client.get("/api/v1/me/schedule", headers=h, params={"start": s2.isoformat(), "days": 1}).json()
    assert [l["course"] for l in later["lessons"]] == ["Python Advanced"]
