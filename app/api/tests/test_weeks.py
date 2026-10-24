"""Any week, past or future: weeks outside the routine sync are fetched from Untis when someone looks."""
import datetime as dt

from roosters import config, db, untis

from .conftest import login, onboard, run_jobs, today
from .test_sync import untis_week


def _fake_weeks(monkeypatch):
    asked = []

    def fetch_week(server, login, class_id, monday):
        asked.append(monday)
        periods = [{"id": int(monday.strftime("%y%m%d")), "start": 900, "end": 1100, "subject": "Databases"}]
        return untis.parse_week(untis_week(class_id, monday + dt.timedelta(days=1), periods), class_id)
    monkeypatch.setattr(untis, "fetch_week", fetch_week)
    # The course scan of the year uses fetch_week too: not what these tests are about
    db.run("UPDATE school_classes SET courses_scanned_at=UTC_TIMESTAMP()")
    return asked


def test_a_week_far_ahead_is_fetched_when_you_look_at_it(client, mails, school, monkeypatch):
    asked = _fake_weeks(monkeypatch)
    u = login(client, "reda@example.com", mails)
    onboard(client, u, school, school["classes"][0])
    run_jobs()
    monday = today() - dt.timedelta(days=today().weekday()) + dt.timedelta(weeks=config.WEEKS_AHEAD + 5)
    params = {"start": monday.isoformat(), "days": 5}
    first = client.get("/api/v1/me/schedule", headers=u["headers"], params=params).json()
    assert first["loading"] is True and first["lessons"] == []
    run_jobs()
    assert monday in asked
    again = client.get("/api/v1/me/schedule", headers=u["headers"], params=params).json()
    assert again["loading"] is False
    assert [(l["day"], l["course"]) for l in again["lessons"]] == [((monday + dt.timedelta(days=1)).isoformat(),
                                                                    "Databases")]
    # Fetched once: looking again doesn't ask Untis again
    n = len(asked)
    client.get("/api/v1/me/schedule", headers=u["headers"], params=params)
    run_jobs()
    assert len(asked) == n


def test_a_past_week_is_fetched_and_kept(client, mails, school, monkeypatch):
    _fake_weeks(monkeypatch)
    u = login(client, "reda@example.com", mails)
    onboard(client, u, school, school["classes"][0])
    monday = today() - dt.timedelta(days=today().weekday()) - dt.timedelta(weeks=6)
    client.get("/api/v1/me/today", headers=u["headers"], params={"day": (monday + dt.timedelta(days=1)).isoformat()})
    run_jobs()
    body = client.get("/api/v1/me/today", headers=u["headers"],
                      params={"day": (monday + dt.timedelta(days=1)).isoformat()}).json()
    assert body["loading"] is False
    assert [l["course"] for l in body["me"]["lessons"]] == ["Databases"]
    assert db.one("SELECT COUNT(*) AS n FROM class_weeks WHERE monday=%s", (monday,))["n"] == 1


def test_weeks_the_routine_sync_covers_are_not_fetched_separately(client, mails, school, monkeypatch):
    asked = _fake_weeks(monkeypatch)
    u = login(client, "reda@example.com", mails)
    onboard(client, u, school, school["classes"][0])
    monday = today() - dt.timedelta(days=today().weekday())
    body = client.get("/api/v1/me/schedule", headers=u["headers"], params={"start": monday.isoformat(), "days": 5}).json()
    assert body["loading"] is False
    run_jobs()
    assert asked == []
