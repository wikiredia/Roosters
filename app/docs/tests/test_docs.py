import os
import time

import pytest
from fastapi.testclient import TestClient

from roostersdocs import app as docs_app
from roostersdocs import content

from .conftest import SRC

W = {"Authorization": f"Bearer {os.environ['DOCS_TOKEN']}", "X-Docs-Author": "tester"}


@pytest.fixture(scope="module")
def c():
    with TestClient(docs_app.app) as client:  # runs the startup import
        yield client


def test_repo_content_is_imported_at_start(c):
    hub = c.get("/docs/v1/hub").json()
    assert hub["hub"]["title"] == "Roosters+" and "Start here." in hub["hub"]["body"]
    assert [g["slug"] for g in hub["guides"]] == ["auth"]
    f = c.get("/docs/v1/file", params={"path": "api/roosters/r_me.py"}).json()
    assert "Still file text." in f["doc"]["body"] and f["doc"]["state"] == "fresh"
    assert {d["symbol"] for d in f["docs"]} == {"me", "helper,MAX_SOURCES"}


def test_the_scan_knows_symbols_routes_and_comments(c):
    f = c.get("/docs/v1/file", params={"path": "api/roosters/r_me.py"}).json()
    by = {s["name"]: s for s in f["symbols"]}
    assert by["me"]["route"] == "GET /api/v1/me" and by["me"]["comment"] == "Who am I."
    assert by["Thing.go"]["kind"] == "method" and by["MAX_SOURCES"]["kind"] == "const"
    ts = c.get("/docs/v1/file", params={"path": "mobile/src/lib/time.ts"}).json()
    kinds = {s["name"]: (s["kind"], s["comment"]) for s in ts["symbols"]}
    assert kinds == {"monday": ("function", "Monday of the week"), "DAY": ("const", ""), "useClock": ("hook", "")}
    assert ts["file"]["comment"] == "Dates and times."
    routes = c.get("/docs/v1/routes").json()["routes"]
    assert routes[0]["route"] == "GET /api/v1/me" and routes[0]["doc_key"]
    # The docs' own content is not code
    assert not any(p["path"].startswith("docs/content") for p in c.get("/docs/v1/tree").json()["files"])


def test_writing_needs_the_token(c):
    r = c.put("/docs/v1/file", json={"path": "mobile/src/lib/time.ts", "body": "x"})
    assert r.status_code == 401
    r = c.put("/docs/v1/file", json={"path": "nope.py", "body": "x"}, headers=W)
    assert r.status_code == 404
    r = c.put("/docs/v1/file", json={"path": "mobile/src/lib/time.ts", "symbol": "ghost", "body": "x"}, headers=W)
    assert r.status_code == 400 and "monday" in r.json()["message"]


def test_a_doc_goes_stale_when_its_code_changes(c):
    r = c.put("/docs/v1/file", json={"path": "mobile/src/lib/time.ts", "symbol": "monday", "body": "Monday."},
              headers=W)
    assert r.status_code == 200
    p = SRC / "mobile" / "src" / "lib" / "time.ts"
    p.write_text(p.read_text().replace("return d;", "return new Date(d);"))
    os.utime(p, (time.time() + 5, time.time() + 5))
    docs_app.scanner._at = 0
    st = c.get("/docs/v1/status").json()
    assert any(s["key"] == "sym:mobile/src/lib/time.ts#monday" for s in st["stale"])
    c.post("/docs/v1/confirm", json={"path": "mobile/src/lib/time.ts", "symbol": "monday"}, headers=W)
    st = c.get("/docs/v1/status").json()
    assert not any(s["key"] == "sym:mobile/src/lib/time.ts#monday" for s in st["stale"])


def test_history_and_revert(c):
    path = "mobile/src/lib/time.ts"
    c.put("/docs/v1/file", json={"path": path, "body": "First."}, headers=W)
    c.put("/docs/v1/file", json={"path": path, "body": "Second."}, headers=W)
    revs = c.get("/docs/v1/history", params={"key": f"file:{path}"}).json()["revisions"]
    assert [r["body"] for r in revs[:2]] == ["Second.", "First."]
    c.post("/docs/v1/revert", json={"id": revs[1]["id"]}, headers=W)
    assert c.get("/docs/v1/file", params={"path": path}).json()["doc"]["body"] == "First."


def test_pages_and_search(c):
    assert c.put("/docs/v1/pages/sync", json={"title": "Sync", "body": "Untis every two hours."}, headers=W).status_code == 200
    hits = c.get("/docs/v1/search", params={"q": "untis"}).json()
    assert any(d["key"] == "page:sync" for d in hits["docs"])
    hits = c.get("/docs/v1/search", params={"q": "who am"}).json()
    assert any(h["symbol"] == "me" for h in hits["code"])
    assert c.delete("/docs/v1/pages/hub", headers=W).status_code == 400


def test_live_edits_win_over_older_repo_copies(c):
    c.put("/docs/v1/file", json={"path": "api/roosters/r_me.py", "symbol": "me", "body": "Live text."}, headers=W)
    assert c.post("/docs/v1/import", headers=W).json()["replaced"] == 0
    f = c.get("/docs/v1/file", params={"path": "api/roosters/r_me.py"}).json()
    assert next(d for d in f["docs"] if d["symbol"] == "me")["body"] == "Live text."


def test_export_round_trips(c):
    files = c.get("/docs/v1/export").json()["files"]
    assert "hub.md" in files and "guides/sync.md" in files
    meta, body, sections = content.parse_file_doc(files["files/api/roosters/r_me.py.md"])
    assert "The /me routes." in body and ("me", "Live text.") in sections
    assert ("helper,MAX_SOURCES", "A group.") in sections


def test_a_future_date_in_the_repo_does_not_beat_live_edits(c):
    import pathlib
    p = pathlib.Path(SRC) / "docs" / "content" / "guides" / "future.md"
    p.write_text("---\ntitle: Future\nupdated: 2999-01-01T00:00:00Z\n---\n\nFrom the repo.\n")
    c.post("/docs/v1/import", headers=W)
    c.put("/docs/v1/pages/future", json={"title": "Future", "body": "Live."}, headers=W)
    assert c.post("/docs/v1/import", headers=W).json()["replaced"] == 0
    assert c.get("/docs/v1/pages/future").json()["page"]["body"] == "Live."
