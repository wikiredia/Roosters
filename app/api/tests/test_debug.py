from roosters import config, debug, mailer

from .conftest import run_jobs


def test_debug_shows_mail_setup_and_last_login_mails(client, mails):
    client.post("/api/v1/auth/email/start", json={"email": "debug@example.com"})
    r = client.get("/api/v1/debug")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["mail"]["mode"] == config.MAIL_MODE
    assert d["login_mails"][0]["status"] == "queued"
    # No worker in the tests: the hint says so
    assert not d["worker"]["alive"]
    assert any("No worker" in h for h in d["hints"])

    run_jobs()
    debug.worker_heartbeat("test-worker")
    d = client.get("/api/v1/debug").json()
    assert d["login_mails"][0]["status"] == "done"
    assert d["worker"]["alive"] and d["worker"]["id"] == "test-worker"
    # The e-mail address never ends up in the answer
    assert "debug@example.com" not in r.text


def test_debug_shows_why_a_login_mail_failed(client, monkeypatch):
    def broken(to, subject, body, html=None):
        raise ConnectionRefusedError("[Errno 111] Connection refused")

    monkeypatch.setattr(mailer, "send", broken)
    client.post("/api/v1/auth/email/start", json={"email": "debug@example.com"})
    run_jobs()
    d = client.get("/api/v1/debug").json()
    assert "Connection refused" in d["login_mails"][0]["last_error"]
    assert any("Connection refused" in h for h in d["hints"])


def test_test_mail_returns_the_smtp_error(client, monkeypatch):
    sent = []
    monkeypatch.setattr(mailer, "send", lambda to, subject, body, html=None: sent.append(to))
    assert client.post("/api/v1/debug/mail", json={"email": "me@example.com"}).json()["ok"] is True
    assert sent == ["me@example.com"]

    def broken(to, subject, body, html=None):
        raise TimeoutError("timed out")

    monkeypatch.setattr(mailer, "send", broken)
    r = client.post("/api/v1/debug/mail", json={"email": "me@example.com"}).json()
    assert r == {"ok": False, "mode": config.MAIL_MODE, "error": "TimeoutError: timed out"}


def test_debug_is_hidden_outside_dev(client, monkeypatch):
    monkeypatch.setattr(config, "DEV", False)
    assert client.get("/api/v1/debug").status_code == 404
    assert client.post("/api/v1/debug/mail", json={"email": "me@example.com"}).status_code == 404
