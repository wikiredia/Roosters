"""Meldingen: opslaan (ook voor de homepagina), voorkeuren, samenvoegen en pushen."""
import base64
import datetime as dt
import json
import logging
import os

from cryptography.hazmat.primitives import serialization

from . import config, db

log = logging.getLogger("roosters.notify")

# Soorten meldingen die je in Opties kan aan- of uitzetten
KINDS = {
    "ochtend": "Ochtend: wie er op campus is en met wie je pauze hebt",
    "pauze_nu": "Je kan nu op pauze met iemand",
    "pauze_wijzig": "Iemand gaat naar huis of komt erbij in je pauze",
    "andere_campus": "Pauze mogelijk met iemand van een andere campus",
    "blijven": "Iemand blijft in Antwerpen of wil chillen",
    "afspraak": "Afspraken: wie gaat waar, wie komt mee",
    "reizen": "Samen naar school of naar huis (avond ervoor)",
    "wijziging": "Wijzigingen in je eigen rooster",
    "apparaat": "Er is een nieuw toestel aan jou gekoppeld",
}
SCOPES = {
    "vrienden": "Alleen mensen uit mijn vriendengroepen",
    "campus": "Vriendengroepen en mensen van mijn campus",
    "iedereen": "Iedereen",
}
DEFAULT_SCOPE = "campus"
ADMIN = 0


def enqueue(person_id, kind, dedupe, title, body, payload=None, day=None, push=True) -> bool:
    day = day or dt.date.today()
    n = db.run(
        "INSERT IGNORE INTO notifications (person_id, kind, dedupe, title, body, payload, day, push) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
        (person_id, kind, dedupe[:190], title[:120], body[:600], db.js(payload or {}), day, 1 if push else 0),
    )
    return bool(n)


def prefs(person_id) -> dict:
    out = {k: True for k in KINDS}
    out["scope"] = DEFAULT_SCOPE
    for r in db.rows("SELECT kind, value FROM notify_prefs WHERE person_id=%s", (person_id,)):
        if r["kind"] == "scope":
            out["scope"] = r["value"] if r["value"] in SCOPES else DEFAULT_SCOPE
        elif r["kind"] in KINDS:
            out[r["kind"]] = r["value"] == "1"
    return out


def all_scopes() -> dict:
    out = {}
    for r in db.rows("SELECT person_id, value FROM notify_prefs WHERE kind='scope'"):
        out[r["person_id"]] = r["value"]
    return out


# ---- VAPID (sleutels voor web push) ------------------------------------------

_vapid = None


def vapid():
    global _vapid
    if _vapid is None:
        _vapid = _load_vapid()
    return _vapid


def _load_vapid():
    from py_vapid import Vapid01

    pem = db.get_setting("vapid_private_pem")
    if not pem:
        v = Vapid01()
        v.generate_keys()
        pem = v.private_pem().decode()
        db.run("INSERT IGNORE INTO settings (k, v) VALUES ('vapid_private_pem', %s)", (pem,))
        pem = db.get_setting("vapid_private_pem")
    return Vapid01.from_pem(pem.encode())


def vapid_public_key() -> str:
    v = vapid()
    raw = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _claims():
    email = os.environ.get("LE_EMAIL", "").strip()
    if email:
        return {"sub": f"mailto:{email}"}
    # Pushdiensten willen een mailto: of https-adres van de afzender
    return {"sub": f"https://{config.PUBLIC_HOST}"}


def _send(sub_rows, payload: dict):
    from pywebpush import WebPushException, webpush

    v = vapid()
    data = json.dumps(payload, ensure_ascii=False)
    sent = 0
    for s in sub_rows:
        try:
            webpush(
                {"endpoint": s["endpoint"], "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}},
                data=data, vapid_private_key=v, vapid_claims=_claims(), ttl=6 * 3600, timeout=10,
            )
            sent += 1
            if s.get("failures"):
                db.run("UPDATE push_subs SET failures=0 WHERE id=%s", (s["id"],))
        except WebPushException as e:
            code = getattr(e.response, "status_code", None)
            if code in (404, 410):
                db.run("DELETE FROM push_subs WHERE id=%s", (s["id"],))
            else:
                db.run("UPDATE push_subs SET failures=failures+1 WHERE id=%s", (s["id"],))
                db.run("DELETE FROM push_subs WHERE id=%s AND failures>=10", (s["id"],))
                log.warning("push mislukt (%s): %s", code, str(e)[:200])
        except Exception as e:  # netwerk e.d.
            log.warning("push fout: %s", str(e)[:200])
    return sent


def subs_for_person(person_id):
    if person_id == ADMIN:
        return db.rows("SELECT s.* FROM push_subs s JOIN devices d ON d.id=s.device_id WHERE d.is_admin=1")
    return db.rows(
        "SELECT s.* FROM push_subs s JOIN devices d ON d.id=s.device_id "
        "WHERE d.person_id=%s AND d.status='approved'", (person_id,))


def push_device(device_id, title, body, url="/"):
    subs = db.rows("SELECT * FROM push_subs WHERE device_id=%s", (device_id,))
    return _send(subs, {"title": title, "body": body, "url": url, "tag": "roosters-toegang"})


def _url(payload: dict) -> str:
    target = payload.get("open")
    if target == "admin-cert":
        return "/#/opties/admin?cert=1"
    if target == "admin":
        return "/#/opties/admin"
    if target == "rooster":
        return "/#/rooster"
    if target == "afspreken":
        return "/#/afspreken"
    return "/#/home"


def send_pending():
    """Stuurt alle nog niet verstuurde meldingen; meerdere tegelijk worden één melding."""
    db.run("UPDATE notifications SET sent_at=UTC_TIMESTAMP() WHERE sent_at IS NULL AND created_at < UTC_TIMESTAMP() - INTERVAL 3 HOUR")
    pending = db.rows("SELECT * FROM notifications WHERE sent_at IS NULL ORDER BY created_at, id")
    by_person = {}
    for n in pending:
        by_person.setdefault(n["person_id"], []).append(n)
    for pid, items in by_person.items():
        ids = [n["id"] for n in items]
        db.run(f"UPDATE notifications SET sent_at=UTC_TIMESTAMP() WHERE id IN ({','.join(['%s'] * len(ids))})", ids)
        p = prefs(pid) if pid != ADMIN else {}
        items = [n for n in items if n["push"] and (pid == ADMIN or p.get(n["kind"], True))]
        if not items:
            continue
        subs = subs_for_person(pid)
        if not subs:
            continue
        # Dubbels (zelfde tekst) samenvoegen
        uniq, seen = [], set()
        for n in items:
            if n["body"] in seen:
                continue
            seen.add(n["body"])
            uniq.append(n)
        if len(uniq) == 1:
            n = uniq[0]
            payload = db.unjs(n["payload"], {})
            msg = {"title": n["title"], "body": n["body"], "url": _url(payload), "tag": f"roosters-{n['kind']}"}
        else:
            lines = [n["body"] for n in uniq[:4]]
            if len(uniq) > 4:
                lines.append(f"… en nog {len(uniq) - 4}")
            msg = {"title": f"Roosters · {len(uniq)} meldingen", "body": "\n".join(lines), "url": "/#/home", "tag": "roosters-samen"}
        _send(subs, msg)
