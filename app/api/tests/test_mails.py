import datetime as dt
import email
import re
from email import policy

from roosters import config, db, mailer
from roosters import mails as texts

from .conftest import login, run_jobs


def _verify(client, sent, address, device, platform="ios"):
    """A full e-mail sign-in from a named phone; the newest code in `sent` is used."""
    client.post("/api/v1/auth/email/start", json={"email": address})
    run_jobs()
    code = next(m.group(0).replace(" ", "") for to, _, b in reversed(sent)
                if to == address and (m := re.search(r"(\d{3}) (\d{3})", b)))
    r = client.post("/api/v1/auth/email/verify",
                    json={"email": address, "code": code, "platform": platform, "device_name": device})
    assert r.status_code == 200, r.text
    run_jobs()
    return r.json()


def test_login_code_mail_has_both_versions_and_the_logo():
    m = texts.login_code("123456", "en")
    assert m.subject == "Your Roosters+ code: 123 456"
    assert "123 456" in m.text and "<" not in m.text
    for digit in "123456":
        assert f">{digit}</td>" in m.html
    assert f"cid:{texts.LOGO_CID}" in m.html and "prefers-color-scheme: dark" in m.html
    assert texts.login_code("123456", "nl").subject == "Je code voor Roosters+: 123 456"


def test_the_device_name_cannot_inject_html():
    m = texts.new_device('<script>alert(1)</script>', "ios", dt.datetime(2026, 10, 30, 12, 0), "en")
    assert "<script>" not in m.html and "&lt;script&gt;" in m.html
    assert "30/10/2026 13:00" in m.text  # Brussels time


def test_sending_attaches_the_logo_inside_the_mail(monkeypatch):
    class FakeSMTP:
        sent = []

        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def login(self, *a):
            pass

        def send_message(self, msg):
            FakeSMTP.sent.append(msg)

    monkeypatch.setattr(config, "MAIL_MODE", "smtp")
    monkeypatch.setattr(config, "SMTP_STARTTLS", False)
    monkeypatch.setattr(config, "SMTP_USER", "")
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    mailer.send_mail("kid@example.com", texts.login_code("654321", "nl"))
    msg = email.message_from_bytes(FakeSMTP.sent[0].as_bytes(), policy=policy.default)
    assert msg.get_body(("plain",)).get_content().count("654 321") >= 1
    html = msg.get_body(("html",))
    assert "654" in html.get_content()
    logo = [p for p in msg.walk() if p.get_content_type() == "image/png"]
    assert len(logo) == 1 and logo[0]["Content-ID"] == f"<{texts.LOGO_CID}>"
    assert logo[0].get_content()[:4] == b"\x89PNG"


def test_a_new_account_gets_one_welcome_and_a_second_login_does_not(client, mails):
    login(client, "Welcome@Example.com", mails)
    run_jobs()
    assert [s for _, s, _ in mails if s.startswith("Welkom")] == ["Welkom bij Roosters+"]
    mails.clear()
    login(client, "welcome@example.com", mails)
    run_jobs()
    assert not [s for _, s, _ in mails if s.startswith("Welkom")]


def test_a_new_phone_gets_a_security_mail_and_the_same_phone_does_not(client, mails):
    _verify(client, mails, "new@example.com", "Reda's iPhone")
    assert not [s for _, s, _ in mails if "sign-in" in s or "aanmelding" in s]  # the first account sign-in
    _verify(client, mails, "new@example.com", "Reda's iPhone")
    assert not [s for _, s, _ in mails if "sign-in" in s or "aanmelding" in s]  # same phone
    _verify(client, mails, "new@example.com", "Galaxy S24", "android")
    notices = [(to, b) for to, s, b in mails if "aanmelding" in s]
    assert len(notices) == 1 and notices[0][0] == "new@example.com" and "Galaxy S24" in notices[0][1]


def test_deleting_the_account_sends_a_goodbye(client, mails):
    s = login(client, "bye@example.com", mails)
    run_jobs()
    assert client.delete("/api/v1/me", headers=s["headers"]).status_code == 204
    run_jobs()
    assert [(to, subj) for to, subj, _ in mails][-1] == ("bye@example.com", "Je Roosters+-account is verwijderd")
    assert db.one("SELECT COUNT(*) AS n FROM users")["n"] == 0
    assert db.one("SELECT COUNT(*) AS n FROM jobs WHERE payload IS NOT NULL")["n"] == 0  # no address kept in a job


def test_a_guest_deleting_their_account_sends_nothing(client, mails):
    g = client.post("/api/v1/auth/guest", json={"platform": "ios"}).json()
    run_jobs()
    assert client.delete("/api/v1/me", headers={"Authorization": f"Bearer {g['access_token']}"}).status_code == 204
    run_jobs()
    assert mails == []
