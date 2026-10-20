"""Redis for everything that has to be shared between API processes and servers:
rate limits, locks, and spacing out requests to Untis.

Rate limits fail open: if Redis is briefly gone, the API keeps working instead of refusing everyone."""
import logging
import secrets
import time
from contextlib import contextmanager

import redis

from . import config
from .errors import ApiError

log = logging.getLogger("roosters.redis")

_client: redis.Redis | None = None

_RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"


def client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(config.REDIS_URL, decode_responses=True,
                                       socket_timeout=2, socket_connect_timeout=2)
    return _client


def hit(key: str, limit: int, per_seconds: int) -> bool:
    """Counts one hit in a fixed window. True = still within the limit."""
    window = int(time.time() // per_seconds)
    k = f"rl:{key}:{window}"
    try:
        pipe = client().pipeline()
        pipe.incr(k)
        pipe.expire(k, per_seconds + 1)
        n, _ = pipe.execute()
    except redis.RedisError as e:
        log.warning("rate limit skipped (%s)", e)
        return True
    return n <= limit


def rate_limit(key: str, limit: int, per_seconds: int):
    if not hit(key, limit, per_seconds):
        raise ApiError(429, "rate", retry_after=per_seconds)


@contextmanager
def lock(name: str, ttl: float = 60, wait: float = 0):
    """Lock across all processes. Yields True when we got it (within `wait` seconds)."""
    token = secrets.token_hex(8)
    key = f"lock:{name}"
    deadline = time.time() + wait
    got = False
    while True:
        got = bool(client().set(key, token, nx=True, px=int(ttl * 1000)))
        if got or time.time() >= deadline:
            break
        time.sleep(0.1)
    try:
        yield got
    finally:
        if got:
            try:
                client().eval(_RELEASE, 1, key, token)
            except redis.RedisError:
                pass  # expires by itself


def throttle(name: str, interval: float, max_wait: float = 30):
    """Waits until at least `interval` seconds passed since the previous call with this name,
    across all workers. Used to stay polite towards Untis."""
    key = f"throttle:{name}"
    deadline = time.time() + max_wait
    while True:
        if client().set(key, "1", nx=True, px=int(interval * 1000)):
            return
        if time.time() >= deadline:
            raise TimeoutError(f"throttle {name}: waited too long")
        left = client().pttl(key)
        time.sleep(max(0.05, (left if left and left > 0 else 100) / 1000))
