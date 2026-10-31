import datetime as dt

from roosters import db, jobs, sync, untis

from .conftest import login, onboard, run_jobs, today


def untis_week(class_id: int, day: dt.date, periods: list[dict]) -> dict:
    """Minimal Untis weekly data: periods = [{id, start (930), end, subject, room, state}]"""
    elements = [{"type": 3, "id": 1, "name": "DB", "longName": "Databases"},
                {"type": 3, "id": 2, "name": "PY", "longName": "Python Advanced"},
                {"type": 4, "id": 10, "name": "B204"}, {"type": 4, "id": 11, "name": "C102"},
                {"type": 2, "id": 50, "name": "JDE", "longName": "Jan De Teacher"}]
    subj = {"Databases": 1, "Python Advanced": 2}
    rooms = {"B204": 10, "C102": 11}
    out = []
    for p in periods:
        refs = [{"type": 3, "id": subj[p["subject"]]}, {"type": 2, "id": 50}]
        if p.get("room"):
            refs.append({"type": 4, "id": rooms[p["room"]]})
        out.append({"id": p["id"], "date": int(day.strftime("%Y%m%d")), "startTime": p["start"], "endTime": p["end"],
                    "cellState": p.get("state", "STANDARD"), "elements": refs, "lessonText": "teacher Jan is ill"})
    return {"elements": elements, "elementPeriods": {str(class_id): out}}


def test_parse_week_keeps_only_what_the_app_needs():
    d = today()
    lessons = untis.parse_week(untis_week(10220, d, [
        {"id": 1, "start": 830, "end": 1030, "subject": "Databases", "room": "B204"},
        {"id": 2, "start": 1100, "end": 1230, "subject": "Python Advanced", "room": "C102", "state": "CANCEL"},
        {"id": 3, "start": 1300, "end": 1400, "subject": "Python Advanced", "state": "FREE"},
    ]), 10220)
    assert [(l["course"], l["start_min"], l["end_min"], l["location"], l["state"]) for l in lessons] == [
        ("Databases", 510, 630, "B204", "normal"), ("Python Advanced", 660, 750, "C102", "cancelled")]
    # No teachers, no free text
    assert all(set(l) == {"uid", "day", "start_min", "end_min", "course", "location", "student_group", "state", "kind"}
               for l in lessons)


def test_a_nameless_lesson_is_always_followed():
    cfg = {"include": ["Databases"], "picked": True}
    assert sync.wanted("", cfg, set()) and not sync.wanted("Python Advanced", cfg, set())


def _fake_untis(monkeypatch, periods_by_call):
    calls = []

    def fetch_class(server, login, class_id, weeks=None, today=None):
        calls.append(class_id)
        periods = periods_by_call[min(len(calls), len(periods_by_call)) - 1]
        return untis.parse_week(untis_week(class_id, today, periods), class_id)
    monkeypatch.setattr(untis, "fetch_class", fetch_class)
    return calls


def test_one_fetch_per_class_and_changes_only_for_people_who_follow_the_course(client, mails, school, monkeypatch):
    k = school["classes"][1]  # never synced yet
    base = [{"id": 1, "start": 830, "end": 1030, "subject": "Databases", "room": "B204"},
            {"id": 2, "start": 1100, "end": 1230, "subject": "Python Advanced", "room": "C102"}]
    moved = [{"id": 1, "start": 830, "end": 1030, "subject": "Databases", "room": "C102"},
             {"id": 2, "start": 1100, "end": 1230, "subject": "Python Advanced", "room": "C102", "state": "CANCEL"}]
    calls = _fake_untis(monkeypatch, [base, moved])
    reda = login(client, "reda@example.com", mails)
    kayra = login(client, "kayra@example.com", mails)
    onboard(client, reda, school, k)                                   # follows everything
    onboard(client, kayra, school, k, include=["Python Advanced"])    # only Python
    run_jobs()
    assert calls == [10187]  # both users, one fetch with the Untis id (the job was deduplicated)
    assert db.one("SELECT last_ok FROM school_classes WHERE id=%s", (k,))["last_ok"] is not None
    # First fetch: nothing counts as a change
    assert db.rows("SELECT * FROM notifications") == []

    sync.sync_class(k)

    def notes(uid):
        return [db.unjs(r["payload"]) for r in db.rows("SELECT payload FROM notifications WHERE user_id=%s", (uid,))]

    assert sorted((n["type"], n["course"]) for n in notes(reda["user_id"])) == [
        ("cancelled", "Python Advanced"), ("changed", "Databases")]
    assert [(n["type"], n["course"]) for n in notes(kayra["user_id"])] == [("cancelled", "Python Advanced")]
    changed = next(n for n in notes(reda["user_id"]) if n["type"] == "changed")
    assert changed["old"]["location"] == "B204" and changed["location"] == "C102"

    # Kayra's schedule only shows Python, Reda's both
    s = client.get("/api/v1/me/schedule", headers=kayra["headers"], params={"start": today().isoformat(), "days": 1}).json()
    assert [l["course"] for l in s["lessons"]] == ["Python Advanced"]
    assert s["lessons"][0]["state"] == "cancelled" and s["lessons"][0]["busy"] is False


def test_an_empty_answer_after_a_full_timetable_removes_nothing(school, monkeypatch):
    k = school["classes"][1]
    periods = [{"id": i, "start": 800 + 100 * i, "end": 850 + 100 * i, "subject": "Databases"} for i in range(1, 7)]
    _fake_untis(monkeypatch, [periods, []])
    sync.sync_class(k)
    sync.sync_class(k)  # Untis hiccup: an empty week
    assert db.one("SELECT COUNT(*) AS n FROM class_lessons WHERE school_class_id=%s AND state='removed'", (k,))["n"] == 0


def test_untis_errors_are_retried_later_and_recorded(school, monkeypatch):
    k = school["classes"][1]

    def broken(*a, **kw):
        raise untis.UntisError("Untis answered with status 503")
    monkeypatch.setattr(untis, "fetch_class", broken)
    sync.queue_class(k, soon=True)
    run_jobs(1)
    job = db.one("SELECT * FROM jobs")
    assert job["status"] == "queued" and job["attempts"] == 1 and job["run_at"] > db.utcnow()
    assert "503" in db.one("SELECT last_error FROM school_classes WHERE id=%s", (k,))["last_error"]


def test_queue_due_only_syncs_classes_someone_follows(client, mails, school):
    assert sync.queue_due(12) == 0
    reda = login(client, "reda@example.com", mails)
    onboard(client, reda, school, school["classes"][0])
    db.run("UPDATE school_classes SET last_sync=%s", (db.utcnow() - dt.timedelta(hours=5),))
    db.run("DELETE FROM jobs")
    assert sync.queue_due(12) == 1
    assert sync.queue_due(12) == 1  # still waiting: deduplicated, not doubled
    assert db.one("SELECT COUNT(*) AS n FROM jobs")["n"] == 1


def test_jobs_are_claimed_by_one_worker_only():
    jobs.enqueue("noop", {}, dedupe="a")
    jobs.enqueue("noop", {}, dedupe="b")
    with db.tx() as c:
        # Worker 1 holds a row lock on the first job...
        first = db.one("SELECT id FROM jobs ORDER BY id LIMIT 1 FOR UPDATE", c=c)
        # ...worker 2 skips it and takes the other one
        other = jobs.claim()
        assert other is not None and other["id"] != first["id"]
