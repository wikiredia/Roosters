"""Versleuteling van geheime links (agenda-URL's) in de database."""
import base64
import hashlib
import hmac
import secrets

from cryptography.fernet import Fernet, InvalidToken

from . import config


def _fernet() -> Fernet:
    if len(config.SECRET_KEY) < 32:
        raise RuntimeError("SECRET_KEY in .env ontbreekt of is te kort (min. 32 tekens)")
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
