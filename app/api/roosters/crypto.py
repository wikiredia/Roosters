"""Versleuteling van geheime links (agenda-URL's) in de database."""
import base64
import hashlib
import hmac
import secrets

from cryptography.fernet import Fernet, InvalidToken

from . import config


def _fernet() -> Fernet:
    if len(config.SECRET_KEY) < 32:
        raise RuntimeError("SECRET_KEY ontbreekt of is te kort (min. 32 tekens)")
    key = hashlib.sha256(("roosters-enc:" + config.SECRET_KEY).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(text: str) -> bytes:
    return _fernet().encrypt(text.encode())


def decrypt(blob) -> str | None:
    if not blob:
        return None
    try:
        return _fernet().decrypt(bytes(blob)).decode()
    except InvalidToken:
        return None


def token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def same(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def derived_key(purpose: str) -> bytes:
    """A separate key per purpose (tokens, login codes, ...), all from SECRET_KEY."""
    if len(config.SECRET_KEY) < 32:
        raise RuntimeError("SECRET_KEY ontbreekt of is te kort (min. 32 tekens)")
    return hmac.new(config.SECRET_KEY.encode(), f"roosters+:{purpose}".encode(), hashlib.sha256).digest()


def keyed_hash(purpose: str, text: str) -> str:
    """HMAC instead of a bare hash: a leaked database can't be brute-forced without SECRET_KEY
    (matters for 6-digit codes and e-mail addresses)."""
    return hmac.new(derived_key(purpose), text.encode(), hashlib.sha256).hexdigest()
