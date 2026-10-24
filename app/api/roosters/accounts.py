"""Whole accounts: deleting one with everything linked to it, and folding a guest into an existing account."""
from . import breaks, chat, db

# Tables with a user_id column that belong to exactly one user (deleted with the account)
_OWNED = ("source_lessons", "sources", "hidden_courses", "checkins", "notifications", "idempotency_keys", "invites",
          "auth_identities", "sessions", "user_photos", "skipped_lessons")


def delete_user(c, uid: int):
    """Deletes the account and everything linked to it, inside the caller's transaction."""
    # Test people it made (testdata.py) go with it
    for r in db.rows("SELECT id FROM users WHERE test_owner_id=%s", (uid,), c):
        delete_user(c, r["id"])
    for table in _OWNED:
        db.run(f"DELETE FROM {table} WHERE user_id=%s", (uid,), c)
    db.run("DELETE FROM friendships WHERE user_id=%s OR friend_id=%s", (uid, uid), c)
    db.run("DELETE FROM friend_requests WHERE from_id=%s OR to_id=%s", (uid, uid), c)
    db.run("DELETE FROM blocks WHERE user_id=%s OR blocked_id=%s", (uid, uid), c)
    breaks.delete_user(c, uid)
    chat.delete_user(c, uid)
    db.run("DELETE FROM users WHERE id=%s", (uid,), c)


def fold_guest(c, guest_id: int, into_id: int):
    """A guest signs in with an address that already has an account: that account wins.
    What the guest set up comes along only where the account has nothing yet (school, timetable,
    hidden courses), then the guest is deleted."""
    guest = db.one("SELECT * FROM users WHERE id=%s AND is_guest=1 FOR UPDATE", (guest_id,), c)
    target = db.one("SELECT * FROM users WHERE id=%s FOR UPDATE", (into_id,), c)
    if guest is None or target is None or guest_id == into_id:
        return
    if target["school_id"] is None and guest["school_id"] is not None:
        db.run("UPDATE users SET school_id=%s, campus_id=%s WHERE id=%s",
               (guest["school_id"], guest["campus_id"], into_id), c)
    has_sources = db.one("SELECT 1 AS x FROM sources WHERE user_id=%s AND deleted_at IS NULL", (into_id,), c)
    if not has_sources:
        db.run("UPDATE sources SET user_id=%s WHERE user_id=%s", (into_id, guest_id), c)
        db.run("UPDATE source_lessons SET user_id=%s WHERE user_id=%s", (into_id, guest_id), c)
        db.run("UPDATE IGNORE hidden_courses SET user_id=%s WHERE user_id=%s", (into_id, guest_id), c)
    if target["onboarded_at"] is None and guest["onboarded_at"] is not None:
        db.run("UPDATE users SET onboarded_at=%s WHERE id=%s", (guest["onboarded_at"], into_id), c)
    delete_user(c, guest_id)
