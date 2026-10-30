"""Signing in: a 6-digit code by e-mail, Sign in with Apple, Sign in with Google. No passwords.

Or not signing in at all (yet): a guest account made on the phone. When a guest later signs in, the
same account gets that sign-in method (nothing is lost); if the address already has an account,
that account wins and the guest is folded into it (accounts.fold_guest)."""
import datetime as dt
import logging
import re
import secrets

import pymysql
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from . import accounts, config, crypto, db, jobs, providers, redisx, tokens
from .deps import Ctx, auth, lang, optional_auth
from .errors import ApiError
from .mailer import mask_address

log = logging.getLogger("roosters.auth")

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")


class Device(BaseModel):
    device_name: str | None = Field(None, max_length=80)
    platform: str | None = Field(None, max_length=10)


class EmailStart(BaseModel):
    email: str = Field(max_length=254)


class EmailVerify(Device):
    email: str = Field(max_length=254)
    code: str = Field(max_length=12)


class AppleLogin(Device):
    id_token: str = Field(max_length=8000)
    nonce: str | None = Field(None, max_length=200)
    # Apple only sends the name the very first time, to the app, not in the token
    name: str | None = Field(None, max_length=60)


class GoogleLogin(Device):
    id_token: str = Field(max_length=8000)


class RefreshIn(BaseModel):
    refresh_token: str = Field(max_length=200)


def _email(value: str) -> str:
    email = (value or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise ApiError(400, "email_invalid")
    return email


def _client_ip(request: Request) -> str:
    # Behind Caddy: X-Forwarded-For is set by our own proxy
    return (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (
        request.client.host if request.client else "?")


def _new_user(c, name: str | None, email: str | None, lang_: str, guest: bool = False) -> int:
    name = (name or "").strip()[:60] or (email.split("@")[0][:60] if email else "Student")
    return db.run("INSERT INTO users (display_name, email, is_guest, locale, avatar_color) VALUES (%s,%s,%s,%s,%s)",
                  (name, email, int(guest), lang_, secrets.randbelow(8)), c)


def _guest_id(request: Request) -> int | None:
    """The guest account this sign-in should upgrade: only when the request carries a guest's token."""
    ctx = optional_auth(request)
    return ctx.uid if ctx and ctx.user["is_guest"] else None


def _existing(c, user_id: int, guest_id: int | None) -> tuple[int, str]:
    """Signing in to an account that already exists: refused if it was turned off; a guest on this
    phone is folded into it."""
    if db.one("SELECT disabled_at FROM users WHERE id=%s", (user_id,), c)["disabled_at"]:
        raise ApiError(403, "account_disabled")
    if guest_id and guest_id != user_id:
        accounts.fold_guest(c, guest_id, user_id)
    return user_id, "existing"


def _sign_in(c, provider: str, subject: str, email: str | None, email_verified: bool, name: str | None,
             lang_: str, guest_id: int | None = None) -> tuple[int, str]:
    """Finds or creates the account for this identity. -> (user_id, how): "existing" (an account that was
    already there, also when found through the same verified address), "guest" (this phone's guest account
    became the account) or "new".
    A verified e-mail address links Apple/Google/e-mail to the same account. With guest_id and no
    account yet, the guest account becomes the account (keeps its school, timetable and settings)."""
    ident = db.one("SELECT * FROM auth_identities WHERE provider=%s AND subject=%s FOR UPDATE", (provider, subject), c)
    if ident:
        db.run("UPDATE auth_identities SET last_used_at=UTC_TIMESTAMP() WHERE id=%s", (ident["id"],), c)
        return _existing(c, ident["user_id"], guest_id)
    user = None
    if email and email_verified:
        user = db.one("SELECT id FROM users WHERE email=%s FOR UPDATE", (email,), c)
    if user:
        user_id, how = _existing(c, user["id"], guest_id)
    elif guest_id:
        user_id, how = guest_id, "guest"
        current = db.one("SELECT display_name FROM users WHERE id=%s", (guest_id,), c)["display_name"]
        # A guest who never picked a name gets one like a new account would (Apple's name, or from the address)
        new_name = (name or "").strip()[:60] or (
            email.split("@")[0][:60] if current == "Student" and email and email_verified else current)
        db.run("UPDATE users SET is_guest=0, email=%s, display_name=%s WHERE id=%s",
               (email if email_verified else None, new_name, guest_id), c)
        # The guest's own session ends: the phone gets a fresh one with this answer
        tokens.revoke_all(guest_id, "guest_signed_in", c)
    else:
        user_id, how = _new_user(c, name, email if email_verified else None, lang_), "new"
    db.run("INSERT INTO auth_identities (user_id, provider, subject, email, last_used_at) "
           "VALUES (%s,%s,%s,%s,UTC_TIMESTAMP())", (user_id, provider, subject, email), c)
    return user_id, how


def _answer(user_id: int, how: str, body: Device, c) -> dict:
    """Tokens plus what happened to the account: the app tells 'you already had an account, you're signed in'
    (account=existing, also when you tapped 'Create account') from 'no account with this address yet' (new)."""
    out = tokens.start_session(user_id, body.device_name, body.platform, c)
    out["is_new"] = how == "new"
    out["account"] = how
    return out


@router.post("/guest")
def guest(body: Device, request: Request):
    """Start without signing in: a guest account on this phone. Timetable yes, friends not yet."""
    redisx.rate_limit(f"guest-ip:{_client_ip(request)}", 60, 600)  # a whole school shares one IP
    with db.tx() as c:
        user_id = _new_user(c, None, None, lang(request), guest=True)
        return _answer(user_id, True, body, c)


@router.post("/email/start", status_code=204)
def email_start(body: EmailStart, request: Request):
    """Sends a 6-digit code. Always answers 204, also for unknown addresses (no way to find out who has an account)."""
    email = _email(body.email)
    email_hash = crypto.keyed_hash("email", email)
    redisx.rate_limit(f"code-ip:{_client_ip(request)}", 60, 600)  # a whole school shares one IP: generous
    redisx.rate_limit(f"code-email:{email_hash}", 5, 3600)
    code = f"{secrets.randbelow(10 ** 6):06d}"
    with db.tx() as c:
        db.run("UPDATE login_codes SET used_at=UTC_TIMESTAMP() WHERE email_hash=%s AND used_at IS NULL", (email_hash,), c)
        db.run("INSERT INTO login_codes (email_hash, code_hash, expires_at) VALUES (%s,%s,%s)",
               (email_hash, crypto.keyed_hash("login-code", f"{email}:{code}"),
                db.utcnow() + dt.timedelta(seconds=config.LOGIN_CODE_TTL)), c)
        job = jobs.enqueue("send_login_code", {"email": email, "code": code, "lang": lang(request)}, priority=0, c=c)
    log.info("login code for %s queued as job %s", mask_address(email), job)
    return Response(status_code=204)


@router.post("/email/verify")
def email_verify(body: EmailVerify, request: Request):
    email = _email(body.email)
    email_hash = crypto.keyed_hash("email", email)
    code = re.sub(r"\D", "", body.code or "")
    redisx.rate_limit(f"verify-email:{email_hash}", 20, 3600)
    with db.tx() as c:
        row = db.one("SELECT * FROM login_codes WHERE email_hash=%s AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() "
                     "ORDER BY id DESC LIMIT 1 FOR UPDATE", (email_hash,), c)
        if row is None:
            raise ApiError(400, "code_invalid")
        if row["attempts"] >= config.LOGIN_CODE_ATTEMPTS:
            raise ApiError(400, "code_attempts")
        if not crypto.same(row["code_hash"], crypto.keyed_hash("login-code", f"{email}:{code}")):
            db.run("UPDATE login_codes SET attempts=attempts+1 WHERE id=%s", (row["id"],), c)
            c.commit()
            raise ApiError(400, "code_invalid")
        db.run("UPDATE login_codes SET used_at=UTC_TIMESTAMP() WHERE id=%s", (row["id"],), c)
        user_id, how = _sign_in(c, "email", email, email, True, None, lang(request), _guest_id(request))
        return _answer(user_id, how, body, c)


def _provider_login(ident: providers.Identity, name: str | None, body: Device, request: Request) -> dict:
    guest_id = _guest_id(request)
    for attempt in range(2):
        try:
            with db.tx() as c:
                user_id, how = _sign_in(c, ident.provider, ident.subject, ident.email, ident.email_verified, name,
                                        lang(request), guest_id)
                return _answer(user_id, how, body, c)
        except pymysql.err.IntegrityError as e:
            # Two simultaneous first logins (double tap on slow wifi): the second one finds the account
            if e.args[0] != db.DUPLICATE or attempt:
                raise
    raise ApiError(500, "server")


@router.post("/apple")
def apple(body: AppleLogin, request: Request):
    redisx.rate_limit(f"provider-ip:{_client_ip(request)}", 120, 600)
    return _provider_login(providers.apple(body.id_token, body.nonce), body.name, body, request)


@router.post("/google")
def google(body: GoogleLogin, request: Request):
    redisx.rate_limit(f"provider-ip:{_client_ip(request)}", 120, 600)
    return _provider_login(providers.google(body.id_token), None, body, request)


@router.post("/refresh")
def refresh(body: RefreshIn):
    return tokens.refresh(body.refresh_token)


@router.post("/logout", status_code=204)
def logout(ctx: Ctx = Depends(auth)):
    tokens.revoke(ctx.session_id)
    return Response(status_code=204)


@router.post("/logout-all", status_code=204)
def logout_all(ctx: Ctx = Depends(auth)):
    tokens.revoke_all(ctx.uid)
    return Response(status_code=204)


@router.get("/sessions")
def sessions(ctx: Ctx = Depends(auth)):
    return {"sessions": [
        {"id": s["id"], "device_name": s["device_name"], "platform": s["platform"], "current": s["id"] == ctx.session_id,
         "created_at": s["created_at"].isoformat() + "Z", "last_used_at": s["last_used_at"].isoformat() + "Z"}
        for s in db.rows("SELECT * FROM sessions WHERE user_id=%s AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP() "
                         "ORDER BY last_used_at DESC", (ctx.uid,))]}
