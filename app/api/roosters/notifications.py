"""In-app notifications, and the push that goes with them (push.py). Stored as kind + payload; the app writes the
text in the app, push.py the text of the push."""
import datetime as dt

from . import db, jobs


def enqueue(user_id: int, kind: str, dedupe: str, payload: dict | None = None, day: dt.date | None = None,
            push: bool = True, c=None) -> bool:
    """False when the same notification (same dedupe key) already exists. With `push`, a push job for the user.
    No dedupe on that job: a user's job that is already sending would swallow it (its dedupe key is only cleared
    when it finishes). The first job sends everything not pushed yet; the ones after it find nothing."""
    new = bool(db.run(
        "INSERT IGNORE INTO notifications (user_id, kind, dedupe, payload, day, push) VALUES (%s,%s,%s,%s,%s,%s)",
        (user_id, kind, dedupe[:190], db.js(payload or {}), day, 1 if push else 0), c))
    if new and push:
        jobs.enqueue("push", {"user_id": user_id}, priority=2, max_attempts=4, c=c)
    return new


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
