"""Status van het Let's Encrypt-certificaat en de debug-prompt voor Claude."""
import datetime as dt
import json
import os

from . import config

STATUS = os.path.join(config.TLS_DIR, "status.json")
CERT = os.path.join(config.TLS_DIR, "fullchain.pem")


def _expiry():
    try:
        from cryptography import x509
        with open(CERT, "rb") as f:
            return x509.load_pem_x509_certificate(f.read()).not_valid_after_utc
    except Exception:
        return None


def read(with_prompt=False) -> dict:
    if config.TLS_MODE != "letsencrypt":
        return {"mode": config.TLS_MODE, "ok": True,
                "note": "Geen Let's Encrypt (TLS_MODE=%s)." % config.TLS_MODE}
    try:
        with open(STATUS) as f:
            st = json.load(f)
    except Exception:
        st = {}
    exp = _expiry()
    now = dt.datetime.now(dt.timezone.utc)
    out = {
        "mode": "letsencrypt",
        "ok": bool(st.get("ok")) and bool(exp),
        "known": bool(st) or bool(exp),
        "expires": exp.isoformat() if exp else st.get("expires"),
        "hours_left": round((exp - now).total_seconds() / 3600, 1) if exp else None,
        "checked": st.get("checked"),
        "failures": st.get("failures", 0),
        "first_failure": st.get("first_failure"),
    }
    if exp and exp < now:
        out["ok"] = False
    if with_prompt and st and not st.get("ok", True):
        out["prompt"] = prompt(st, out)
    return out


def prompt(st: dict, out: dict) -> str:
    ip = st.get("ip") or config.PUBLIC_IP
    log = (st.get("log") or "(geen log)").strip()
    expires = (f"{out['expires']} (nog {out['hours_left']} uur)" if out.get("hours_left") is not None
               else "onbekend (nog geen geldig certificaat gevonden)")
    return f"""Mijn Roosters-server kan het Let's Encrypt-certificaat niet vernieuwen. Help me dit debuggen en oplossen.

Context:
- Repo wikiredia/Roosters, map server/. Docker Compose met de diensten web (Apache, poort 80->8080 en 443->8443), api, worker, db (MySQL) en certbot.
- Het certificaat is een IP-certificaat voor {ip} (Let's Encrypt profiel 'shortlived', ~6 dagen geldig), aangevraagd door server/certbot/renew.py met certbot --webroot -w /acme --ip-address {ip}.
- Apache serveert /.well-known/acme-challenge/ op poort 80 uit het volume 'acme' (zie server/apache/httpd.conf).
- Mislukt sinds: {st.get('first_failure')} ({st.get('failures', '?')} pogingen). Laatste poging: {st.get('checked')}.
- Huidig certificaat verloopt: {expires}.

Uitvoer van de laatste poging:
```
{log[-4000:]}
```

Wat ik wil dat je doet (ik zit op de server, in de map server/ van de repo):
1. Lees de fout hierboven en zeg in gewone woorden wat er mis is.
2. Controleer: `docker compose ps`, `docker compose logs --tail=200 certbot web`, of poort 80 van buitenaf open staat (port forwarding naar deze server, test via mobiele data: http://{ip}/.well-known/acme-challenge/test), of de router/provider poort 80 blokkeert, en of het publieke IP nog {ip} is (`curl -4 ifconfig.me`).
3. Kijk na of Let's Encrypt zelf problemen heeft of of we een rate limit raken.
4. Los het op en forceer een nieuwe poging met `docker compose restart certbot`; volg met `docker compose logs -f certbot`.
"""
