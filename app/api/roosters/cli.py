"""Admin commands (run inside the api container: docker compose exec api python -m roosters.cli ...).

    add-school ap "AP Hogeschool" --short AP --untis ap.webuntis.com --login ap
    add-campus ap "Spoor Noord"
    schools
    sync-class <class id>
"""
import argparse
import json

from . import db, jobs, sync


def add_school(a):
    db.run("INSERT INTO schools (slug, name, short_name, untis_server, untis_login, tz) VALUES (%s,%s,%s,%s,%s,%s) "
           "ON DUPLICATE KEY UPDATE name=VALUES(name), short_name=VALUES(short_name), untis_server=VALUES(untis_server), "
           "untis_login=VALUES(untis_login), tz=VALUES(tz), active=1",
           (a.slug, a.name, a.short, a.untis, a.login, a.tz))
    school = db.one("SELECT * FROM schools WHERE slug=%s", (a.slug,))
    if school["untis_server"]:
        jobs.enqueue("refresh_classes", {"school_id": school["id"]}, dedupe=f"refresh_classes:{school['id']}", priority=1)
    print(f"school {school['id']} ({school['slug']}) ready; the worker fetches its classes")


def add_campus(a):
    school = db.one("SELECT id FROM schools WHERE slug=%s", (a.slug,))
    if not school:
        raise SystemExit(f"unknown school {a.slug}")
    db.run("INSERT IGNORE INTO campuses (school_id, name) VALUES (%s,%s)", (school["id"], a.name))
    print("ok")


def schools(_a):
    for s in db.rows("SELECT s.id, s.slug, s.name, s.untis_server, s.classes_synced_at, "
                     "(SELECT COUNT(*) FROM school_classes c WHERE c.school_id=s.id AND c.active=1) AS classes, "
                     "(SELECT GROUP_CONCAT(name ORDER BY name SEPARATOR ', ') FROM campuses WHERE school_id=s.id) AS campuses "
                     "FROM schools s ORDER BY s.id"):
        print(json.dumps(s, default=str, ensure_ascii=False))


def sync_class(a):
    print(json.dumps(sync.sync_class(a.class_id), default=str, ensure_ascii=False, indent=1))


def main():
    p = argparse.ArgumentParser(prog="roosters.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("add-school")
    s.add_argument("slug")
    s.add_argument("name")
    s.add_argument("--short")
    s.add_argument("--untis", help="Untis server, e.g. ap.webuntis.com")
    s.add_argument("--login", help="Untis school login name, e.g. ap")
    s.add_argument("--tz", default="Europe/Brussels")
    s.set_defaults(fn=add_school)
    c = sub.add_parser("add-campus")
    c.add_argument("slug")
    c.add_argument("name")
    c.set_defaults(fn=add_campus)
    sub.add_parser("schools").set_defaults(fn=schools)
    sc = sub.add_parser("sync-class")
    sc.add_argument("class_id", type=int)
    sc.set_defaults(fn=sync_class)
    a = p.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
