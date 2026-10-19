"""Ruwe plaats bij een IP-adres, offline (DB-IP Lite, CC BY 4.0). Geen externe dienst per verzoek."""
import ipaddress
import os
import threading

from . import config

PATH = os.path.join(config.DATA_DIR, "dbip-city-lite.mmdb")
_reader = None
_mtime = None
_lock = threading.Lock()


def _get_reader():
    global _reader, _mtime
    try:
        m = os.path.getmtime(PATH)
    except OSError:
        return None
    with _lock:
        if _reader is None or m != _mtime:
            import maxminddb
            try:
                _reader = maxminddb.open_database(PATH)
                _mtime = m
            except Exception:
                _reader = None
    return _reader


def city(ip: str) -> str | None:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return None
    if addr.is_private or addr.is_loopback:
        return "Thuisnetwerk (zelfde wifi als de server)"
    r = _get_reader()
    if not r:
        return None
    try:
        rec = r.get(ip) or {}
    except Exception:
        return None
    town = ((rec.get("city") or {}).get("names") or {}).get("nl") or ((rec.get("city") or {}).get("names") or {}).get("en")
    country = (rec.get("country") or {}).get("iso_code")
    parts = [x for x in (town, country) if x]
    return ", ".join(parts) or None
