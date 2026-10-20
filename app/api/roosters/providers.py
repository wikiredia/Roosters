"""Sign in with Apple and Google: the app gets an ID token (a JWT signed by Apple/Google) and sends it
here; we check the signature against their public keys, the audience (our app ids) and the issuer."""
import hashlib
import json
import time
from dataclasses import dataclass

import jwt

from . import config
from .errors import ApiError
from .netfetch import FetchError, fetch

APPLE_KEYS = "https://appleid.apple.com/auth/keys"
APPLE_ISSUERS = {"https://appleid.apple.com"}
GOOGLE_KEYS = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}

# Public keys rarely change; per process for an hour is fine (nothing secret, nothing to share).
_jwks: dict[str, tuple[float, dict]] = {}
JWKS_TTL = 3600


@dataclass
class Identity:
    provider: str
    subject: str
    email: str | None
    email_verified: bool


def _load_jwks(url: str) -> dict:
    status, _, body = fetch(url, headers={"Accept": "application/json"}, max_bytes=256 * 1024)
    if status != 200:
        raise FetchError(f"status {status}")
    return json.loads(body)


def _key_for(url: str, kid: str):
    cached = _jwks.get(url)
    if cached is None or time.time() - cached[0] > JWKS_TTL or not _find(cached[1], kid):
        try:
            _jwks[url] = (time.time(), _load_jwks(url))
        except (FetchError, ValueError):
            if cached is None:
                raise ApiError(503, "provider_unavailable")
    key = _find(_jwks[url][1], kid)
    if key is None:
        raise ApiError(401, "provider_invalid")
    return jwt.PyJWK(key).key


def _find(jwks: dict, kid: str):
    return next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)


def _verify(id_token: str, keys_url: str, issuers: set, audiences: list[str]) -> dict:
    if not audiences:
        raise ApiError(503, "provider_unavailable")
    try:
        kid = jwt.get_unverified_header(id_token).get("kid")
    except jwt.InvalidTokenError:
        raise ApiError(401, "provider_invalid")
    key = _key_for(keys_url, kid or "")
    try:
        claims = jwt.decode(id_token, key, algorithms=["RS256"], audience=audiences, leeway=60,
                            options={"require": ["exp", "iat", "iss", "aud", "sub"]})
    except jwt.InvalidTokenError:
        raise ApiError(401, "provider_invalid")
    if claims.get("iss") not in issuers:
        raise ApiError(401, "provider_invalid")
    return claims


def _verified(value) -> bool:
    # Apple sends "true"/"false" as text, Google as a boolean
    return value is True or str(value).lower() == "true"


def apple(id_token: str, raw_nonce: str | None) -> Identity:
    claims = _verify(id_token, APPLE_KEYS, APPLE_ISSUERS, config.APPLE_CLIENT_IDS)
    # The app sends Apple sha256(nonce) and us the nonce itself: replaying a stolen token doesn't work
    if claims.get("nonce") or raw_nonce:
        expected = hashlib.sha256((raw_nonce or "").encode()).hexdigest()
        if claims.get("nonce") != expected:
            raise ApiError(401, "provider_invalid")
    return Identity("apple", claims["sub"], (claims.get("email") or "").lower() or None,
                    _verified(claims.get("email_verified")))


def google(id_token: str) -> Identity:
    claims = _verify(id_token, GOOGLE_KEYS, GOOGLE_ISSUERS, config.GOOGLE_CLIENT_IDS)
    return Identity("google", claims["sub"], (claims.get("email") or "").lower() or None,
                    _verified(claims.get("email_verified")))
