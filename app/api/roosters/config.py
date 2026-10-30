"""Settings, all from environment variables (see app/.env.example)."""
import os
import zoneinfo


def _list(name: str) -> list[str]:
    return [x.strip() for x in os.environ.get(name, "").split(",") if x.strip()]


# dev = laptop (mail to Mailpit, readable errors), prod = server
ENV = os.environ.get("ENV", "dev")
DEV = ENV == "dev"
# The owner's account: the debug endpoints and screens (r_debug.py, the app's Server & debug and Test data) work for
# it on every server, also with ENV=prod. Signed in with this e-mail (or as one of the test people it made).
DEBUG_EMAIL = os.environ.get("DEBUG_EMAIL", "reda.kadi07@gmail.com").strip().lower()

# Fallback for schools without their own timezone
TZ = zoneinfo.ZoneInfo(os.environ.get("TZ_DEFAULT", "Europe/Brussels"))

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3306"))
DB_NAME = os.environ.get("DB_NAME", "roosters")
DB_USER = os.environ.get("DB_USER", "roosters")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_POOL = int(os.environ.get("DB_POOL", "16"))

REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")

# At least 32 characters. Used for tokens, login codes and encrypting calendar links.
SECRET_KEY = os.environ.get("SECRET_KEY", "")

PUBLIC_URL = os.environ.get("PUBLIC_URL", "http://localhost:8000").rstrip("/")
# Web origins that may call the API from a browser (the native app needs none). "*" only on the laptop.
CORS_ORIGINS = _list("CORS_ORIGINS")

# Management console (roosters.admin, the Smart-Room console's Roosters+ tab). At least 32 characters;
# empty = the admin API refuses everything.
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")

# Login
ACCESS_TTL = int(os.environ.get("ACCESS_TTL", str(15 * 60)))  # seconds
REFRESH_TTL_DAYS = int(os.environ.get("REFRESH_TTL_DAYS", "180"))
LOGIN_CODE_TTL = 10 * 60
LOGIN_CODE_ATTEMPTS = 5
# Bundle id (native) and Services id (web) of the app at Apple; client ids at Google
APPLE_CLIENT_IDS = _list("APPLE_CLIENT_IDS")
GOOGLE_CLIENT_IDS = _list("GOOGLE_CLIENT_IDS")

# Mail: "smtp" (Mailpit on the laptop, a real provider on the server) or "console" (only log)
MAIL_MODE = os.environ.get("MAIL_MODE", "console")
MAIL_FROM = os.environ.get("MAIL_FROM", "Roosters+ <no-reply@localhost>")
SMTP_HOST = os.environ.get("SMTP_HOST", "localhost")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "1025"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_STARTTLS = os.environ.get("SMTP_STARTTLS", "0") == "1"

# Push (push.py): "expo" (Expo's push service, no account needed) or "console" (only log)
PUSH_MODE = os.environ.get("PUSH_MODE", "expo")
# Only when "enhanced push security" is on in the Expo dashboard
EXPO_ACCESS_TOKEN = os.environ.get("EXPO_ACCESS_TOKEN", "")

# Timetables
SYNC_EVERY_DAY = 120      # minutes between syncs of a class or calendar (06:00–22:00)
SYNC_EVERY_NIGHT = 480
REFRESH_COOLDOWN = 90     # seconds between two manual refreshes per user
UNTIS_MIN_INTERVAL = 1.0  # seconds between two requests to the same Untis server (all workers together)
WEEKS_AHEAD = 3
SCAN_MAX_WEEKS = 53     # weeks of one school year the course scan fetches at most
COURSES_RESCAN_DAYS = 30
SCAN_SEMESTER_MAX = 14   # weeks of one semester the course scan looks at, at most
KEEP_PAST_DAYS = 400     # class lessons are kept this long, so you can scroll back through the school year
WEEK_STALE_HOURS = 24    # a future week fetched on demand is fetched again when it's older than this
WEEKS_MAX_DISTANCE = 104 # how many weeks back or ahead someone can look (Untis has nothing further anyway)  # the course list of a class is fetched again when it's older than this

# Friends
MAX_FRIENDS = 300
MAX_COMPARE_FREE = 3      # more people at once is Premium (later)
