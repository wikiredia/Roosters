"""The admin API for the management console: token, schools/campuses/classes, users, jobs, tables."""
import pytest
from fastapi.testclient import TestClient

from roosters import admin, config, db, jobs

from .conftest import login, onboard

H = {"Authorization": f"Bearer {config.ADMIN_TOKEN}", "X-Admin-Actor": "MacBook"}


@pytest.fixture
def ac():
    return TestClient(admin.app)


def test_the_token_is_required(ac, monkeypatch):
    assert ac.get("/admin/v1/overview").status_code == 401
    assert ac.get("/admin/v1/overview", headers={"Authorization": "Bearer nope"}).status_code == 401
    monkeypatch.setattr(config, "ADMIN_TOKEN", "short")
    r = ac.get("/admin/v1/overview", headers=H)
    assert r.status_code == 503 and r.json()["code"] == "admin_off"
    assert ac.get("/admin/health").json() == {"ok": True, "configured": False}


def test_the_public_api_has_no_admin_routes(client):
    assert client.get("/admin/v1/overview", headers=H).status_code == 404


def test_overview_counts(ac, client, school, mails):
    login(client, "ana@example.com", mails)
    client.post("/api/v1/auth/guest", json={})
    c = ac.get("/admin/v1/overview", headers=H).json()["counts"]
    assert c["users"] == 1 and c["guests"] == 1 and c["schools"] == 1 and c["classes"] == 2


def test_add_edit_and_delete_a_school(ac):
    r = ac.post("/admin/v1/schools", headers=H, json={"slug": "KdG", "name": "Karel de Grote", "short_name": "KdG",
                                                       "untis_server": "KdG.webuntis.com", "untis_login": "kdg",
                                                       "campuses": ["Groenplaats", "Hoboken", " "]})
    assert r.status_code == 201, r.text
    s = r.json()["school"]
    assert s["slug"] == "kdg" and s["untis_server"] == "kdg.webuntis.com"
    # The worker fetches its classes
    assert db.one("SELECT kind FROM jobs WHERE dedupe=%s", (f"refresh_classes:{s['id']}",))
    listed = ac.get("/admin/v1/schools", headers=H).json()["schools"]
    assert [c["name"] for c in listed[0]["campuses"]] == ["Groenplaats", "Hoboken"]
    assert ac.post("/admin/v1/schools", headers=H, json={"slug": "kdg", "name": "x"}).status_code == 409
    assert ac.post("/admin/v1/schools", headers=H, json={"slug": "Bad slug!", "name": "x"}).status_code == 400
    assert ac.post("/admin/v1/schools", headers=H, json={"slug": "x", "name": "x", "tz": "Mars/Base"}).status_code == 400
    r = ac.patch(f"/admin/v1/schools/{s['id']}", headers=H, json={"active": False, "name": "KdG Hogeschool"})
    assert r.json()["school"]["active"] is False and r.json()["school"]["name"] == "KdG Hogeschool"
    assert ac.delete(f"/admin/v1/schools/{s['id']}", headers=H).status_code == 204
    assert db.one("SELECT id FROM campuses WHERE school_id=%s", (s["id"],)) is None
    log = ac.get("/admin/v1/log", headers=H).json()["log"]
    assert [x["action"] for x in log][:3] == ["school_delete", "school_edit", "school_add"]
    assert log[0]["actor"] == "MacBook"


def test_a_school_in_use_cant_be_deleted(ac, client, school, mails):
    a = login(client, "ana@example.com", mails)
    onboard(client, a, school, school["classes"][0])
    r = ac.delete(f"/admin/v1/schools/{school['id']}", headers=H)
    assert r.status_code == 409 and r.json()["code"] == "school_in_use"


def test_campuses(ac, client, school, mails):
    a = login(client, "ana@example.com", mails)
    onboard(client, a, school, school["classes"][0])
    cid = ac.post(f"/admin/v1/schools/{school['id']}/campuses", headers=H, json={"name": "Paardenmarkt"}).json()["campus"]["id"]
    assert ac.patch(f"/admin/v1/campuses/{cid}", headers=H, json={"name": "Paardenmarkt 2"}).json()["campus"]["name"] == "Paardenmarkt 2"
    # Deleting the campus a user is on: their campus becomes 'not set'
    assert ac.delete(f"/admin/v1/campuses/{school['campuses'][0]}", headers=H).status_code == 204
    assert client.get("/api/v1/me", headers=a["headers"]).json()["user"]["campus_id"] is None


def test_classes_and_sync(ac, client, school, mails):
    a = login(client, "ana@example.com", mails)
    onboard(client, a, school, school["classes"][0])
    cls = ac.get(f"/admin/v1/schools/{school['id']}/classes", headers=H).json()["classes"]
    assert cls[0]["id"] == school["classes"][0] and cls[0]["followers"] == 1
    assert ac.get(f"/admin/v1/schools/{school['id']}/classes?q=1IT", headers=H).json()["classes"][0]["name"] == "1IT7"
    assert ac.post(f"/admin/v1/classes/{school['classes'][1]}/sync", headers=H).status_code == 202
    r = ac.patch(f"/admin/v1/classes/{school['classes'][1]}", headers=H, json={"active": False})
    assert r.json()["class"]["active"] == 0
    assert len(client.get(f"/api/v1/schools/{school['id']}/classes", headers=a["headers"]).json()["classes"]) == 1


def test_users_search_turn_off_and_delete(ac, client, school, mails):
    a = login(client, "ana@example.com", mails)
    login(client, "bo@example.com", mails)
    found = ac.get("/admin/v1/users?q=ana", headers=H).json()
    assert found["total"] == 1 and found["users"][0]["email"] == "ana@example.com"
    assert ac.get(f"/admin/v1/users?q={a['user_id']}", headers=H).json()["users"][0]["id"] == a["user_id"]
    detail = ac.get(f"/admin/v1/users/{a['user_id']}", headers=H).json()
    assert detail["sign_in"][0]["provider"] == "email" and len(detail["sessions"]) == 1
    r = ac.patch(f"/admin/v1/users/{a['user_id']}", headers=H, json={"disabled": True, "school_id": school["id"]})
    assert r.status_code == 200 and r.json()["user"]["disabled_at"]
    assert client.get("/api/v1/me", headers=a["headers"]).status_code == 401
    assert ac.get("/admin/v1/users?kind=disabled", headers=H).json()["total"] == 1
    ac.patch(f"/admin/v1/users/{a['user_id']}", headers=H, json={"disabled": False})
    assert ac.delete(f"/admin/v1/users/{a['user_id']}", headers=H).status_code == 204
    assert ac.get(f"/admin/v1/users/{a['user_id']}", headers=H).status_code == 404


def test_jobs_run_now_and_codes_stay_hidden(ac, client, mails):
    client.post("/api/v1/auth/email/start", json={"email": "ana@example.com"})
    j = ac.get("/admin/v1/jobs?kind=send_login_code", headers=H).json()["jobs"][0]
    assert j["payload"]["code"] == "•••" and j["payload"]["email"] == "•••"
    db.run("UPDATE jobs SET run_at=UTC_TIMESTAMP() + INTERVAL 1 HOUR WHERE id=%s", (j["id"],))
    assert jobs.claim() is None
    assert ac.post(f"/admin/v1/jobs/{j['id']}/run-now", headers=H).status_code == 202
    assert jobs.claim()["id"] == j["id"]
    # A finished job has no payload left: it can't be run again
    db.run("UPDATE jobs SET status='failed' WHERE id=%s", (j["id"],))
    assert ac.post(f"/admin/v1/jobs/{j['id']}/run-now", headers=H).status_code == 404


def test_tables_are_read_only_and_mask_secrets(ac, client, mails):
    a = login(client, "ana@example.com", mails)
    names = [t["name"] for t in ac.get("/admin/v1/tables", headers=H).json()["tables"]]
    assert "users" in names and "admin_log" in names
    r = ac.get(f"/admin/v1/tables/sessions?column=user_id&value={a['user_id']}", headers=H).json()
    assert r["total"] == 1 and r["rows"][0]["refresh_hash"] == "•••"
    assert ac.get("/admin/v1/tables/nope", headers=H).status_code == 404
    assert ac.get("/admin/v1/tables/users?column=x`; DROP", headers=H).status_code == 400
