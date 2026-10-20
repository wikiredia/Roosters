"""In-app notifications (and later push). Stored as kind + payload; the app writes the text."""
import datetime as dt

from . import db


def enqueue(user_id: int, kind: str, dedupe: str, payload: dict | None = None, day: dt.date | None = None,
            push: bool = True, c=None) -> bool:
    """False when the same notification (same dedupe key) already exists."""
    return bool(db.run(
        "INSERT IGNORE INTO notifications (user_id, kind, dedupe, payload, day, push) VALUES (%s,%s,%s,%s,%s,%s)",
        (user_id, kind, dedupe[:190], db.js(payload or {}), day, 1 if push else 0), c))


def out(r: dict) -> dict:
    return {"id": r["id"], "kind": r["kind"], "payload": db.unjs(r["payload"], {}),
            "day": r["day"].isoformat() if r["day"] else None, "created_at": r["created_at"].isoformat() + "Z",
            "read": r["read_at"] is not None}


def list_for(user_id: int, after_id: int = 0, limit: int = 50) -> list[dict]:
    return [out(r) for r in db.rows(
        "SELECT * FROM notifications WHERE user_id=%s AND id > %s ORDER BY id DESC LIMIT %s",
        (user_id, after_id, limit))]


def mark_read(user_id: int, up_to_id: int):
    db.run("UPDATE notifications SET read_at=UTC_TIMESTAMP() WHERE user_id=%s AND id <= %s AND read_at IS NULL",
           (user_id, up_to_id))
