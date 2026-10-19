"""Beheercommando's (via ./roosters.sh)."""
import json
import secrets
import sys

from . import backup, certstatus, crypto, db


def admin_code():
    code = f"{secrets.randbelow(10 ** 8):08d}"
    db.run("DELETE FROM admin_codes WHERE expires_at < UTC_TIMESTAMP()")
    db.run("INSERT INTO admin_codes (code_hash, expires_at) VALUES (%s, UTC_TIMESTAMP() + INTERVAL 10 MINUTE)",
           (crypto.sha("admin:" + code),))
    print()
    print(f"   Admin-code:  {code[:4]} {code[4:]}")
    print()
    print("   Geldig: 10 minuten, één keer bruikbaar.")
    print("   Open de app op je gsm/laptop → Opties → helemaal onderaan 'Admin-code' en tik de code in.")
    print()


def gate(state):
    if state not in ("on", "off"):
        sys.exit("gebruik: gate on|off")
    db.set_setting("gate", state)
    print("Goedkeuring verplicht:", "AAN" if state == "on" else "UIT")


def import_config():
    """Mensen + Untis-klassen uit de config.json van de GitHub Pages-versie."""
    cfg = json.load(sys.stdin)
    server = cfg.get("server", "").replace("https://", "").strip("/")
    login = cfg.get("school", "")
    for person in cfg.get("people", []):
        p = db.one("SELECT id FROM people WHERE LOWER(name)=LOWER(%s) AND deleted_at IS NULL", (person["name"],))
        pid = p["id"] if p else db.run("INSERT INTO people (name) VALUES (%s)", (person["name"],))
        for src in person.get("sources", []):
            exists = db.rows("SELECT id, config FROM sources WHERE person_id=%s AND kind='untis' AND deleted_at IS NULL", (pid,))
            if any((db.unjs(r["config"], {}) or {}).get("class_id") == src["id"] for r in exists):
                continue
            conf = {"server": server, "login": login, "school": "AP Hogeschool", "class_id": src["id"],
                    "class": src.get("class", str(src["id"])), "include": src.get("include", []), "exclude": src.get("exclude", [])}
            label = f"Untis · AP Hogeschool · {conf['class']}"
            if conf["include"]:
                label += f" ({len(conf['include'])} vakken)"
            db.run("INSERT INTO sources (person_id, kind, label, config) VALUES (%s,'untis',%s,%s)", (pid, label, db.js(conf)))
        print(f"{person['name']}: klaar")


def restore():
    data = sys.stdin.buffer.read()
    counts = backup.restore_zip(data)
    for t, n in counts.items():
        print(f"{t}: {n}")
    print("Backup teruggezet.")


def status():
    gate_ = db.get_setting("gate", "off")
    n = lambda sql: db.one(sql)["n"]  # noqa: E731
    print(f"Goedkeuring verplicht: {'AAN' if gate_ == 'on' else 'UIT'}")
    print(f"Mensen: {n('SELECT COUNT(*) AS n FROM people WHERE deleted_at IS NULL')}")
    ok = n("SELECT COUNT(*) AS n FROM devices WHERE status='approved'")
    waiting = n("SELECT COUNT(*) AS n FROM devices WHERE status='pending'")
    print(f"Toestellen: {ok} toegelaten, {waiting} wachtend")
    print(f"Bronnen met fout: {n('SELECT COUNT(*) AS n FROM sources WHERE deleted_at IS NULL AND last_error IS NOT NULL')}")
    print(f"Certificaat: {certstatus.read()}")


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit("commando: admin-code | gate on|off | import-config | restore | status")
    db.init_schema()
    cmd = args[0]
    if cmd == "admin-code":
        admin_code()
    elif cmd == "gate":
        gate(args[1] if len(args) > 1 else "")
    elif cmd == "import-config":
        import_config()
    elif cmd == "restore":
        restore()
    elif cmd == "status":
        status()
    else:
        sys.exit(f"onbekend commando: {cmd}")


if __name__ == "__main__":
    main()
