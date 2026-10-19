import os
import zoneinfo

TZ = zoneinfo.ZoneInfo("Europe/Brussels")

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3306"))
DB_NAME = os.environ.get("DB_NAME", "roosters")
DB_USER = os.environ.get("DB_USER", "roosters")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")

SECRET_KEY = os.environ.get("SECRET_KEY", "")
PUBLIC_IP = os.environ.get("PUBLIC_IP", "").strip()
PUBLIC_HOST = os.environ.get("PUBLIC_HOST", "").strip() or PUBLIC_IP or "localhost"
TLS_MODE = os.environ.get("TLS_MODE", "letsencrypt")
SECURE = TLS_MODE != "off"
BASE_URL = f"{'https' if SECURE else 'http'}://{PUBLIC_HOST}"

DATA_DIR = os.environ.get("DATA_DIR", "/data")
TLS_DIR = os.environ.get("TLS_DIR", "/tls")

# Cookie: __Host- kan enkel over https
COOKIE_NAME = "__Host-roosters" if SECURE else "roosters"
COOKIE_MAX_AGE = 400 * 24 * 3600  # browsers laten niet langer toe; wordt bij elk bezoek vernieuwd

# Hoe vaak roosters automatisch opnieuw opgehaald worden (minuten)
SYNC_EVERY_DAY = 120
SYNC_EVERY_NIGHT = 480
REFRESH_COOLDOWN = 90  # seconden tussen twee keer 'Vernieuwen' per persoon
