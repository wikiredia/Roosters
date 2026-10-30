"""Troubleshooting the path of a login code: API -> job in MySQL -> worker -> SMTP (Mailpit on the laptop).

Used by GET /api/v1/debug (ENV=dev, or the owner's account: `allowed`) and by `python -m roosters.cli debug`."""
import socket
import time

from . import config, db, mailer, mails, redisx

HEARTBEAT_KEY = "worker:heartbeat"


def allowed(user: dict | None) -> bool:
    """May this user use the debug tools on a server that isn't ENV=dev? Only the owner's account (config.DEBUG_EMAIL),
    also while switched to one of the test people it made (they belong to it: `test_owner_id`)."""
    if not user or not config.DEBUG_EMAIL:
        return False
    if user.get("test_owner_id"):
        user = db.one("SELECT email, is_guest, disabled_at FROM users WHERE id=%s", (user["test_owner_id"],))
        if not user or user["disabled_at"]:
            return False
    return not user["is_guest"] and (user["email"] or "").strip().lower() == config.DEBUG_EMAIL


def worker_heartbeat(worker_id: str):
    """Called by the worker loop: lets the API see that a worker is running."""
    redisx.client().set(HEARTBEAT_KEY, f"{worker_id} {int(time.time())}", ex=120)


def _smtp_check() -> dict:
    if config.MAIL_MODE != "smtp":
        return {"checked": False}
    try:
        with socket.create_connection((config.SMTP_HOST, config.SMTP_PORT), timeout=3) as s:
            s.settimeout(3)
            greeting = s.recv(200).decode(errors="replace").strip()
        return {"checked": True, "reachable": True, "greeting": greeting[:120]}
    except OSError as e:
        return {"checked": True, "reachable": False, "error": f"{e.__class__.__name__}: {e}"}


def _worker() -> dict:
    raw = redisx.client().get(HEARTBEAT_KEY)
    if not raw:
        return {"alive": False}
    worker_id, ts = raw.rsplit(" ", 1)
    ago = int(time.time()) - int(ts)
    return {"alive": ago < 60, "id": worker_id, "seen_seconds_ago": ago}


def _hints(mail: dict, worker: dict, jobs: list[dict]) -> list[str]:
    out = []
    if not worker["alive"]:
        out.append("No worker is running, so login codes are queued but never sent. Start it: docker compose up -d worker")
    if mail["mode"] != "smtp":
        out.append("MAIL_MODE is not 'smtp': codes are only written to the worker log "
                   "(docker compose logs worker). Set MAIL_MODE=smtp in .env for Mailpit.")
    elif not mail["smtp"].get("reachable"):
        out.append(f"The SMTP server {mail['smtp_host']}:{mail['smtp_port']} can't be reached: "
                   f"{mail['smtp'].get('error')}. Is Mailpit running (docker compose ps)?")
    failed = [j for j in jobs if j["last_error"]]
    if failed:
        out.append(f"The last login mail failed with: {failed[0]['last_error']}")
    if worker["alive"] and any(j["status"] == "queued" and j["age_seconds"] > 60 for j in jobs):
        out.append("A login mail is queued for over a minute while a worker runs: check docker compose logs worker")
    if not jobs:
        out.append("No login code was requested yet. If the app says 'That didn't work', the app doesn't reach this "
                   "API: check the server address on the app's debug screen.")
    return out


def diagnose() -> dict:
    mail = {"mode": config.MAIL_MODE, "from": config.MAIL_FROM, "smtp_host": config.SMTP_HOST,
            "smtp_port": config.SMTP_PORT, "starttls": config.SMTP_STARTTLS, "smtp_login": bool(config.SMTP_USER),
            "smtp": _smtp_check()}
    worker = _worker()
    jobs = db.rows("SELECT id, status, attempts, last_error, created_at, finished_at, "
                   "TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP()) AS age_seconds FROM jobs "
                   "WHERE kind='send_login_code' ORDER BY id DESC LIMIT 5")
    for j in jobs:
        for k in ("created_at", "finished_at"):
            j[k] = j[k].isoformat() + "Z" if j[k] else None
    return {
        "env": config.ENV,
        "public_url": config.PUBLIC_URL,
        "cors_origins": config.CORS_ORIGINS,
        "mail": mail,
        "worker": worker,
        "login_mails": jobs,
        "hints": _hints(mail, worker, jobs),
    }


def send_test_mail(to: str) -> dict:
    """Sends right away (not through the worker), so an SMTP error comes back here."""
    try:
        mailer.send_mail(to, mails.mail_check())
        return {"ok": True, "mode": config.MAIL_MODE}
    except Exception as e:  # noqa: BLE001 (any SMTP or socket error is the answer we want to show)
        return {"ok": False, "mode": config.MAIL_MODE, "error": f"{e.__class__.__name__}: {e}"}
