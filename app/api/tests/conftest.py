"""Tests run against a real MySQL and Redis (docker compose -f app/docker-compose.test.yml up -d, or the
services in CI). Every test starts with empty tables."""
import datetime as dt
import os
import re

os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_NAME", "roosters_test")
os.environ.setdefault("DB_USER", "roosters")
os.environ.setdefault("DB_PASSWORD", "roosters")
os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/15")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-1234567890")
os.environ.setdefault("MAIL_MODE", "console")
os.environ.setdefault("PUSH_MODE", "console")
os.environ.setdefault("ADMIN_TOKEN", "test-admin-token-that-is-long-enough-0123456789")
os.environ.setdefault("APPLE_CLIENT_IDS", "be.roostersplus.app")
os.environ.setdefault("GOOGLE_CLIENT_IDS", "google-client-id.apps.googleusercontent.com")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from roosters import db, jobs, mailer, migrate, redisx, sync  # noqa: E402
from roosters.app import app  # noqa: E402
from roosters.schedule import local_now  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def schema():
    migrate.wait_for_db(60)
    with db.conn() as c:
        db.run("SET FOREIGN_KEY_CHECKS=0", c=c)
        for t in db.rows("SHOW TABLES", c=c):
            db.run(f"DROP TABLE `{list(t.values())[0]}`", c=c)
    migrate.migrate()


@pytest.fixture(autouse=True)
def clean():
    with db.conn() as c:
        for t in db.rows("SHOW TABLES", c=c):
            name = list(t.values())[0]
            if name != "schema_migrations":
                db.run(f"DELETE FROM `{name}`", c=c)
    redisx.client().flushdb()
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mails(monkeypatch):
    sent = []
    monkeypatch.setattr(mailer, "send", lambda to, subject, body: sent.append((to, subject, body)))
    return sent


def run_jobs(limit: int = 50) -> int:
    n = 0
    while n < limit and jobs.run_one():
        n += 1
    return n


def login(client: TestClient, email: str, mails: list | None = None) -> dict:
    """Signs in with an e-mail code and returns the token answer + headers."""
    captured = mails if mails is not None else []
    original = mailer.send
    mailer.send = lambda to, subject, body: captured.append((to, subject, body))
    try:
        r = client.post("/api/v1/auth/email/start", json={"email": email})
        assert r.status_code == 204, r.text
        run_jobs()
    finally:
        mailer.send = original
    body = next(b for to, _, b in reversed(captured) if to == email.lower())
    code = re.search(r"(\d{3}) (\d{3})", body).group(0).replace(" ", "")
    r = client.post("/api/v1/auth/email/verify", json={"email": email, "code": code, "platform": "ios"})
    assert r.status_code == 200, r.text
    out = r.json()
    out["headers"] = {"Authorization": f"Bearer {out['access_token']}"}
    out["user_id"] = client.get("/api/v1/me", headers=out["headers"]).json()["user"]["id"]
    return out


@pytest.fixture
def school():
    """AP with two campuses and two classes; class 1 already has a timetable for today."""
    sid = db.run("INSERT INTO schools (slug, name, short_name, untis_server, untis_login) "
                 "VALUES ('ap','AP Hogeschool','AP','ap.webuntis.com','ap')")
    c1 = db.run("INSERT INTO campuses (school_id, name) VALUES (%s,'Spoor Noord')", (sid,))
    c2 = db.run("INSERT INTO campuses (school_id, name) VALUES (%s,'Meistraat')", (sid,))
    k1 = db.run("INSERT INTO school_classes (school_id, untis_id, name, long_name, last_ok) "
                "VALUES (%s,10220,'2ITCSC1a','2e jaar CSC',UTC_TIMESTAMP())", (sid,))
    k2 = db.run("INSERT INTO school_classes (school_id, untis_id, name, long_name) VALUES (%s,10187,'1IT7','1e jaar IT')",
                (sid,))
    return {"id": sid, "campuses": [c1, c2], "classes": [k1, k2]}


def today() -> dt.date:
    return local_now({}).date()


def add_class_lessons(class_id: int, lessons: list[tuple], day: dt.date | None = None):
    """lessons: (start 'HH:MM', end 'HH:MM', course, location)."""
    day = day or today()
    for i, (s, e, course, loc) in enumerate(lessons):
        sh, sm = map(int, s.split(":"))
        eh, em = map(int, e.split(":"))
        l = {"uid": f"{class_id}:{day}:{i}", "day": day, "start_min": sh * 60 + sm, "end_min": eh * 60 + em,
             "course": course, "location": loc, "state": "normal"}
        db.run("INSERT INTO class_lessons (school_class_id, uid, day, start_min, end_min, course, location, state, "
               "fingerprint) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
               (class_id, l["uid"], day, l["start_min"], l["end_min"], course, loc, "normal", sync.fingerprint(l)))


def onboard(client, user: dict, school: dict, class_id: int, campus: int = 0, include=None):
    h = user["headers"]
    r = client.patch("/api/v1/me", headers=h, json={"school_id": school["id"], "campus_id": school["campuses"][campus],
                                                     "onboarded": True})
    assert r.status_code == 200, r.text
    r = client.post("/api/v1/me/sources/untis", headers=h, json={"class_id": class_id, "include": include or []})
    assert r.status_code == 201, r.text
    return r.json()["source"]


def befriend(client, a: dict, b: dict):
    code = client.post("/api/v1/invites", headers=a["headers"]).json()["invite"]["code"]
    r = client.post(f"/api/v1/invites/{code}/accept", headers=b["headers"])
    assert r.status_code == 200, r.text
