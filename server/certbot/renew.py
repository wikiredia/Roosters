"""Vraagt een Let's Encrypt-certificaat aan voor het publieke IP en vernieuwt het.

IP-certificaten zijn maar ~6 dagen geldig. Dit script kijkt elke 6 uur en vernieuwt
zodra er minder dan 100 uur over is, dus er blijven na een mislukte poging nog
enkele dagen over om het op te lossen. De uitkomst gaat naar /tls/status.json;
de worker leest dat en stuurt bij een fout een pushmelding naar de admin.
"""
import datetime as dt
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

from cryptography import x509

IP = os.environ.get("PUBLIC_IP", "").strip()
EMAIL = os.environ.get("LE_EMAIL", "").strip()
STAGING = os.environ.get("LE_STAGING", "") == "1"
LIVE = Path("/etc/letsencrypt/live/roosters")
TLS = Path("/tls")
STATUS = TLS / "status.json"
APACHE_UID = 33  # www-data in de httpd-image
RENEW_BELOW = dt.timedelta(hours=100)
CHECK_EVERY = 6 * 3600
RETRY_AFTER_FAIL = 3600


def now():
    return dt.datetime.now(dt.timezone.utc)


def expiry(path: Path):
    try:
        cert = x509.load_pem_x509_certificate(path.read_bytes())
        return cert.not_valid_after_utc
    except Exception:
        return None


def read_status():
    try:
        return json.loads(STATUS.read_text())
    except Exception:
        return {}


def write_status(data):
    tmp = STATUS.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=1))
    tmp.chmod(0o644)
    tmp.replace(STATUS)


def install():
    """Kopieert het certificaat naar /tls, leesbaar voor Apache (privésleutel enkel voor Apache)."""
    for name, mode in (("fullchain.pem", 0o644), ("privkey.pem", 0o600)):
        tmp = TLS / f".{name}.tmp"
        shutil.copyfile(LIVE / name, tmp)
        os.chown(tmp, APACHE_UID, APACHE_UID)
        tmp.chmod(mode)
        tmp.replace(TLS / name)


def request():
    cmd = [
        "certbot", "certonly", "--non-interactive", "--agree-tos",
        "--webroot", "-w", "/acme",
        "--preferred-profile", "shortlived",
        "--ip-address", IP,
        "--cert-name", "roosters",
        "--force-renewal",
    ]
    cmd += ["-m", EMAIL] if EMAIL else ["--register-unsafely-without-email"]
    if STAGING:
        cmd.append("--staging")
    return subprocess.run(cmd, capture_output=True, text=True, timeout=600)


def main():
    if not IP:
        print("PUBLIC_IP ontbreekt in .env; certbot doet niets.")
        while True:
            time.sleep(3600)
    TLS.mkdir(exist_ok=True)
    Path("/acme/.well-known/acme-challenge").mkdir(parents=True, exist_ok=True)
    os.chmod("/acme", 0o755)
    while True:
        exp = expiry(LIVE / "fullchain.pem")
        if exp and exp - now() > RENEW_BELOW:
            if not (TLS / "fullchain.pem").exists():
                install()
            st = read_status()
            st.update({"ok": True, "checked": now().isoformat(), "expires": exp.isoformat(), "ip": IP})
            write_status(st)
            time.sleep(CHECK_EVERY)
            continue

        print(f"Certificaat aanvragen voor {IP} (huidig verloopt: {exp})")
        res = request()
        st = read_status()
        if res.returncode == 0 and expiry(LIVE / "fullchain.pem"):
            install()
            new_exp = expiry(LIVE / "fullchain.pem")
            write_status({
                "ok": True, "checked": now().isoformat(), "renewed": now().isoformat(),
                "expires": new_exp.isoformat(), "ip": IP, "failures": 0,
            })
            print(f"Gelukt, geldig tot {new_exp}")
            time.sleep(CHECK_EVERY)
        else:
            log = (res.stdout + "\n" + res.stderr).strip()
            try:
                log += "\n--- letsencrypt.log ---\n" + "\n".join(
                    Path("/var/log/letsencrypt/letsencrypt.log").read_text(errors="replace").splitlines()[-60:]
                )
            except Exception:
                pass
            write_status({
                "ok": False, "checked": now().isoformat(), "ip": IP,
                "expires": exp.isoformat() if exp else None,
                "failures": int(st.get("failures", 0)) + 1,
                "first_failure": st.get("first_failure") if not st.get("ok", True) else now().isoformat(),
                "returncode": res.returncode,
                "log": log[-6000:],
            })
            print(f"Mislukt (code {res.returncode}); nieuwe poging over een uur")
            time.sleep(RETRY_AFTER_FAIL)


if __name__ == "__main__":
    main()
