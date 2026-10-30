import base64
import datetime as dt
import hashlib
import re
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from roosters import db, providers, tokens

from .conftest import login, run_jobs


def _code_from(mails, email):
    body = next(b for to, _, b in reversed(mails) if to == email)
    return re.search(r"(\d{3}) (\d{3})", body).group(0).replace(" ", "")


def test_email_code_creates_the_account_once(client, mails):
    first = login(client, "Reda@Example.com", mails)
    assert first["is_new"] is True and first["account"] == "new"
    again = login(client, "reda@example.com", mails)
    # 'Create account' with an address that has one: the app says you were signed in to it
    assert again["is_new"] is False and again["account"] == "existing"
    assert again["user_id"] == first["user_id"]
    me = client.get("/api/v1/me", headers=again["headers"]).json()["user"]
    assert me["email"] == "reda@example.com" and me["display_name"] == "reda"


def test_mail_follows_the_language(client, mails):
    client.post("/api/v1/auth/email/start", json={"email": "kayra@example.com"}, headers={"Accept-Language": "en-GB"})
    run_jobs()
    assert mails[-1][1].startswith("Your Roosters+ code")
    client.post("/api/v1/auth/email/start", json={"email": "yeno@example.com"}, headers={"Accept-Language": "nl-BE"})
    run_jobs()
    assert mails[-1][1].startswith("Je code voor Roosters+")


def test_wrong_codes_lock_the_code(client, mails):
    client.post("/api/v1/auth/email/start", json={"email": "a@example.com"})
    run_jobs()
    good = _code_from(mails, "a@example.com")
    bad = f"{(int(good) + 1) % 10 ** 6:06d}"
    for _ in range(5):
        r = client.post("/api/v1/auth/email/verify", json={"email": "a@example.com", "code": bad})
        assert r.json()["code"] == "code_invalid"
    r = client.post("/api/v1/auth/email/verify", json={"email": "a@example.com", "code": good})
    assert r.status_code == 400 and r.json()["code"] == "code_attempts"


def test_a_code_works_once_and_a_new_one_replaces_the_old(client, mails):
    client.post("/api/v1/auth/email/start", json={"email": "b@example.com"})
    run_jobs()
    old = _code_from(mails, "b@example.com")
    client.post("/api/v1/auth/email/start", json={"email": "b@example.com"})
    run_jobs()
    new = _code_from(mails, "b@example.com")
    assert client.post("/api/v1/auth/email/verify", json={"email": "b@example.com", "code": old}).status_code == 400 \
        or old == new
    assert client.post("/api/v1/auth/email/verify", json={"email": "b@example.com", "code": new}).status_code == 200
    assert client.post("/api/v1/auth/email/verify", json={"email": "b@example.com", "code": new}).status_code == 400


def test_errors_are_translated(client):
    r = client.post("/api/v1/auth/email/start", json={"email": "nope"}, headers={"Accept-Language": "en"})
    assert r.status_code == 400 and r.json() == {"code": "email_invalid",
                                                 "message": "That doesn't look like a valid e-mail address."}
    r = client.get("/api/v1/me")
    assert r.status_code == 401 and r.json()["message"] == "Log opnieuw in."


def test_code_requests_are_rate_limited_per_address(client, mails):
    for _ in range(5):
        assert client.post("/api/v1/auth/email/start", json={"email": "c@example.com"}).status_code == 204
    r = client.post("/api/v1/auth/email/start", json={"email": "c@example.com"})
    assert r.status_code == 429 and r.headers["retry-after"]


# ---- Sessions ---------------------------------------------------------------------

def test_refresh_rotates_and_the_old_token_stops_after_the_grace_period(client, mails):
    s = login(client, "d@example.com", mails)
    r1 = client.post("/api/v1/auth/refresh", json={"refresh_token": s["refresh_token"]}).json()
    assert r1["refresh_token"] != s["refresh_token"]
    # Lost answer on slow wifi: retrying with the old token still works for a moment
    r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert r2.status_code == 200
    # ...and that made r1's token useless (only the newest one counts)
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": r1["refresh_token"]}).status_code == 401
    # The phone uses the newest pair...
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {r2.json()['access_token']}"}).status_code == 200
    # ...so long after rotation, the previous token showing up again ends the whole session
    db.run("UPDATE sessions SET rotated_at=%s", (db.utcnow() - dt.timedelta(minutes=10),))
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert r.status_code == 401 and r.json()["reason"] == "reuse"
    newest = r2.json()["refresh_token"]
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": newest})
    assert r.status_code == 401 and r.json()["code"] == "auth_expired" and r.json()["reason"] == "reuse"


def test_a_lost_refresh_answer_never_ends_the_session(client, mails):
    """The app was closed (or reloaded) while refreshing: the server rotated, the phone never got the new pair.
    Even much later, its old token still works, because the newer pair was never used."""
    s = login(client, "lost@example.com", mails)
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": s["refresh_token"]}).status_code == 200
    db.run("UPDATE sessions SET rotated_at=%s", (db.utcnow() - dt.timedelta(hours=5),))
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert r.status_code == 200
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).status_code == 200
    # And going on from there works as usual
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": r.json()["refresh_token"]}).status_code == 200


def test_an_ended_session_says_why(client, mails):
    s = login(client, "why@example.com", mails)
    assert client.post("/api/v1/auth/logout", headers=s["headers"]).status_code == 204
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert r.status_code == 401 and r.json()["reason"] == "logout"
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": "nonsense"})
    assert r.status_code == 401 and r.json()["reason"] == "unknown_token"


def test_logout_everywhere_ends_all_sessions_immediately(client, mails):
    phone = login(client, "e@example.com", mails)
    laptop = login(client, "e@example.com", mails)
    assert len(client.get("/api/v1/auth/sessions", headers=phone["headers"]).json()["sessions"]) == 2
    assert client.post("/api/v1/auth/logout-all", headers=laptop["headers"]).status_code == 204
    assert client.get("/api/v1/me", headers=phone["headers"]).status_code == 401
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": phone["refresh_token"]}).status_code == 401


def test_expired_and_forged_access_tokens(client, mails):
    s = login(client, "f@example.com", mails)
    expired = jwt.encode({"sub": str(s["user_id"]), "sid": 1, "iat": 0, "exp": 1, "typ": "access"},
                         tokens._key(), algorithm="HS256")
    r = client.get("/api/v1/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401 and r.json()["code"] == "auth_expired"
    forged = jwt.encode({"sub": str(s["user_id"]), "sid": 1, "exp": int(time.time()) + 60, "typ": "access"},
                        "not-our-key-but-long-enough-for-hs256-ok", algorithm="HS256")
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


# ---- Apple & Google ---------------------------------------------------------------

@pytest.fixture
def idp(monkeypatch):
    """A fake Apple/Google: our own RSA key in their JWKS."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    nums = key.public_key().public_numbers()

    def b64(n):
        return base64.urlsafe_b64encode(n.to_bytes((n.bit_length() + 7) // 8, "big")).rstrip(b"=").decode()

    jwks = {"keys": [{"kty": "RSA", "kid": "k1", "alg": "RS256", "use": "sig", "n": b64(nums.n), "e": b64(nums.e)}]}
    monkeypatch.setattr(providers, "_load_jwks", lambda url: jwks)
    providers._jwks.clear()

    def token(iss, aud, sub, **claims):
        now = int(time.time())
        return jwt.encode({"iss": iss, "aud": aud, "sub": sub, "iat": now, "exp": now + 600, **claims}, key,
                          algorithm="RS256", headers={"kid": "k1"})
    return token


def test_sign_in_with_apple_with_nonce(client, idp):
    nonce = "random-nonce"
    tok = idp("https://appleid.apple.com", "be.roostersplus.app", "apple-123", email="x@privaterelay.appleid.com",
              email_verified="true", nonce=hashlib.sha256(nonce.encode()).hexdigest())
    r = client.post("/api/v1/auth/apple", json={"id_token": tok, "nonce": nonce, "name": "Kayra"})
    assert r.status_code == 200 and r.json()["is_new"]
    me = client.get("/api/v1/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()["user"]
    assert me["display_name"] == "Kayra"
    # Same token with another nonce (replay): refused
    assert client.post("/api/v1/auth/apple", json={"id_token": tok, "nonce": "other"}).status_code == 401


def test_tokens_for_another_app_or_issuer_are_refused(client, idp):
    wrong_aud = idp("https://appleid.apple.com", "com.other.app", "apple-1")
    assert client.post("/api/v1/auth/apple", json={"id_token": wrong_aud}).json()["code"] == "provider_invalid"
    wrong_iss = idp("https://evil.example", "be.roostersplus.app", "apple-1")
    assert client.post("/api/v1/auth/apple", json={"id_token": wrong_iss}).status_code == 401


def test_google_links_to_the_account_with_the_same_verified_email(client, idp, mails):
    s = login(client, "lotte@example.com", mails)
    tok = idp("https://accounts.google.com", "google-client-id.apps.googleusercontent.com", "g-42",
              email="Lotte@example.com", email_verified=True)
    r = client.post("/api/v1/auth/google", json={"id_token": tok})
    assert r.status_code == 200 and r.json()["is_new"] is False and r.json()["account"] == "existing"
    me = client.get("/api/v1/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()["user"]
    assert me["id"] == s["user_id"]


def test_unverified_email_does_not_take_over_an_account(client, idp, mails):
    s = login(client, "amir@example.com", mails)
    tok = idp("https://accounts.google.com", "google-client-id.apps.googleusercontent.com", "g-99",
              email="amir@example.com", email_verified=False)
    r = client.post("/api/v1/auth/google", json={"id_token": tok})
    assert r.status_code == 200 and r.json()["is_new"] is True
    me = client.get("/api/v1/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()["user"]
    assert me["id"] != s["user_id"] and me["email"] is None
