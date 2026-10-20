"""Achtergrondwerk: roosters ophalen, meldingen maken en versturen, opruimen, certificaat bewaken."""
import datetime as dt
import gzip
import logging
import os
import time
import traceback

from . import certstatus, config, db, events, geoip, logic, notify, sync
from .daydata import load as load_day, now_local, relevant
from .netfetch import fetch

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("roosters.worker")

TRAVEL_HOUR = 19  # 's avonds een voorstel voor morgen


# ---- Roosters ophalen ----------------------------------------------------------

def due_sources(limit=6):
    """Bronnen die aan de beurt zijn. Mensen die enkel wachtende toestellen hebben, nog niet."""
    hour = now_local().hour
    every = config.SYNC_EVERY_DAY if 6 <= hour < 22 else config.SYNC_EVERY_NIGHT
    return db.rows(
        "SELECT s.* FROM sources s JOIN people p ON p.id=s.person_id AND p.deleted_at IS NULL "
        "WHERE s.deleted_at IS NULL AND ("
        "  NOT EXISTS (SELECT 1 FROM devices d WHERE d.person_id=s.person_id) "
        "  OR EXISTS (SELECT 1 FROM devices d WHERE d.person_id=s.person_id AND d.status='approved')"
        "  OR (SELECT v FROM settings WHERE k='gate') IS NULL OR (SELECT v FROM settings WHERE k='gate')='off'"
        ") AND (s.refresh_requested=1 OR s.last_sync IS NULL OR s.last_sync < UTC_TIMESTAMP() - INTERVAL (%s + MOD(s.id, 15)) MINUTE) "
        "ORDER BY s.refresh_requested DESC, s.last_sync IS NOT NULL, s.last_sync LIMIT %s",
        (every, limit))


def run_syncs():
    for s in due_sources():
        r = sync.sync_source(s)
        if not r["ok"]:
            log.info("bron %s (%s): %s", s["id"], s["label"], r["error"])


# ---- Meldingen over pauzes ---------------------------------------------------------

def _scope(scopes, pid):
    return scopes.get(pid, notify.DEFAULT_SCOPE)


def _with_devices():
    return {r["person_id"] for r in db.rows("SELECT DISTINCT person_id FROM devices WHERE status='approved' AND person_id IS NOT NULL")}


def day_notifications():
    nowdt = now_local()
    t = nowdt.date()
    now = nowdt.hour * 60 + nowdt.minute
    if not 6 * 60 <= now < 22 * 60:
        return
    people, infos, campus_names = load_day(t)
    scopes = notify.all_scopes()
    targets = _with_devices()
    for pid in targets:
        me = people.get(pid)
        if not me:
            continue
        info = infos[pid]
        scope = _scope(scopes, pid)
        parts = [x for x in logic.partners(me, people, infos) if relevant(me, people[x["id"]], scope)]

        # a) Ochtend: bij je eerste les
        if info.busy and info.busy[0][0] <= now < info.busy[0][0] + 90:
            on_campus = [p for p in people.values() if p.id != pid and infos[p.id].present and logic.same_campus(me, p)]
            same = sorted({people[x["id"]].name for x in parts if x["same_campus"]})
            other = sorted({people[x["id"]].name for x in parts if not x["same_campus"]})
            n = len(on_campus)
            text = f"{n} {'persoon' if n == 1 else 'mensen'} op campus." if n else "Niemand anders op campus vandaag."
            if same:
                text += f" Pauze met {logic.names(same)}."
            if other:
                text += f" Pauze mogelijk met {logic.names(other)} (andere campus)."
            notify.enqueue(pid, "ochtend", f"ochtend:{t}", "Goeiemorgen", text,
                           {"open": "vergelijk", "people": sorted({pid, *[x["id"] for x in parts]})}, t)

        # b) Pauze begint nu (zelfde campus)
        starting = {}
        for x in parts:
            if x["same_campus"] and x["start"] <= now < x["start"] + 10:
                starting.setdefault(x["start"], []).append(x)
        for s, xs in starting.items():
            nm = logic.names(sorted(people[x["id"]].name for x in xs))
            end = max(x["end"] for x in xs)
            notify.enqueue(pid, "pauze_nu", f"pauze:{t}:{s}", "Pauze", f"Je kan nu met {nm} op pauze (tot {logic.fmt(end)}).",
                           {"open": "vergelijk", "people": [pid, *[x["id"] for x in xs]], "start": s, "end": end}, t)

        # c) Andere campus: melden zodra het mogelijk is (nog niet voorbij)
        for x in parts:
            if x["same_campus"] or x["end"] <= now:
                continue
            o = people[x["id"]]
            notify.enqueue(pid, "andere_campus", f"cross:{t}:{o.id}:{x['start']}", "Pauze met andere campus",
                           f"Een pauze met {o.name} is mogelijk, allebei {logic.duration(x['end'] - x['start'])} geen les "
                           f"({logic.fmt(x['start'])}–{logic.fmt(x['end'])}).",
                           {"open": "vergelijk", "people": [pid, o.id], "start": x["start"], "end": x["end"]}, t)

        # d) Wie komt erbij / wie valt weg
        snapshot = {str(x["id"]): [x["start"], x["end"]] for x in parts if x["end"] > now}
        prev_row = db.one("SELECT data FROM day_state WHERE person_id=%s AND day=%s", (pid, t))
        prev = db.unjs(prev_row["data"], None) if prev_row else None
        if prev is not None:
            gone = [int(k) for k, v in prev.items() if k not in snapshot and v[1] > now + 1 and int(k) in people]
            new = [int(k) for k in snapshot if k not in prev]
            remaining = sorted({people[int(k)].name for k in snapshot})
            for oid in gone:
                o = people[oid]
                st = (o.checkin or {}).get("status")
                why = (f"{o.name} gaat naar huis" if st == "home" else
                       f"{o.name} is er vandaag niet" if st == "absent" else
                       f"De pauze met {o.name} gaat niet meer door")
                rest = (f", je hebt alleen pauze met {logic.names(remaining)} nu." if remaining else
                        ", je hebt vandaag geen pauze meer met iemand.")
                notify.enqueue(pid, "pauze_wijzig", f"weg:{t}:{oid}:{prev[str(oid)][0]}", "Pauze gewijzigd", why + rest,
                               {"open": "vergelijk", "people": [pid, *[int(k) for k in snapshot]]}, t)
            for oid in new:
                s, e = snapshot[str(oid)]
                o = people[oid]
                notify.enqueue(pid, "pauze_wijzig", f"nieuw:{t}:{oid}:{s}", "Nieuw in je pauze",
                               f"Nieuw: pauze met {o.name} om {logic.fmt(s)} (tot {logic.fmt(e)}).",
                               {"open": "vergelijk", "people": [pid, oid], "start": s, "end": e}, t)
        db.run("INSERT INTO day_state (person_id, day, data) VALUES (%s,%s,%s) ON DUPLICATE KEY UPDATE data=VALUES(data)",
               (pid, t, db.js(snapshot)))


def travel_notifications():
    """'s Avonds: met wie kan je morgen samen naar school of naar huis?"""
    nowdt = now_local()
    if nowdt.hour != TRAVEL_HOUR:
        return
    tm = nowdt.date() + dt.timedelta(days=1)
    people, infos, _ = load_day(tm)
    for p in people.values():
        p.checkin = None
    infos = {pid: logic.day_info(p) for pid, p in people.items()}
    prefs = {(r["person_id"], r["other_id"]): r["pref"] for r in db.rows("SELECT * FROM travel_prefs")}
    targets = _with_devices()
    per_person = {}
    for x in logic.travel_pairs(people, infos, prefs):
        per_person.setdefault(x["a"], []).append((x["b"], x["kind"], x["time_a"]))
        per_person.setdefault(x["b"], []).append((x["a"], x["kind"], x["time_b"]))
    for pid, items in per_person.items():
        if pid not in targets:
            continue
        for oid, kind, time_ in items:
            o = people[oid]
            text = (f"Morgen kan je met {o.name} naar school (allebei les om ±{logic.fmt(time_)})." if kind == "heen" else
                    f"Morgen kan je samen met {o.name} naar huis (allebei klaar om ±{logic.fmt(time_)}).")
            notify.enqueue(pid, "reizen", f"reizen:{tm}:{oid}:{kind}", "Samen reizen", text,
                           {"open": "home", "travel": {"other": oid, "kind": kind}}, tm)


# ---- Gebeurtenissen in de groepschat (geen push, enkel het rode bolletje) -------------

def chat_events():
    """In de chat van elke vriendengroep: wie nu stopt met de les en wie nu samen pauze heeft."""
    nowdt = now_local()
    t = nowdt.date()
    now = nowdt.hour * 60 + nowdt.minute
    if not 6 * 60 <= now < 22 * 60:
        return
    people, infos, _ = load_day(t)
    groups = {}
    for r in db.rows("SELECT gm.group_id, gm.person_id FROM group_members gm "
                     "JOIN user_groups g ON g.id=gm.group_id AND g.kind='friends' AND g.deleted_at IS NULL"):
        groups.setdefault(r["group_id"], []).append(r["person_id"])
    for gid, members in groups.items():
        for end, ids in events.done_now(members, people, infos, now):
            events.post_group(gid, events.done_text([people[i].name for i in ids]), dedupe=f"klaar:{t}:{end}:{','.join(map(str, ids))}",
                              payload={"actors": ids, "people": ids, "day": t.isoformat(), "start": end, "open": "vergelijk"})
        for m in events.breaks_starting(members, people, infos, now):
            names_ = sorted((people[i].name for i in m["ids"]), key=str.lower)
            events.post_group(gid, events.break_text(names_, m["end"]), dedupe=f"pauze:{t}:{m['start']}:{','.join(map(str, sorted(m['ids'])))}",
                              payload={"actors": m["ids"], "people": m["ids"], "day": t.isoformat(), "start": m["start"],
                                       "end": m["end"], "open": "vergelijk"})


# ---- Testmelding vanuit Beheer --------------------------------------------------

def push_test():
    at = db.get_setting("push_test_at")
    if not at or at > db.utcnow().strftime("%Y-%m-%d %H:%M:%S"):
        return
    db.run("DELETE FROM settings WHERE k='push_test_at'")
    t = now_local().date()
    people = {r["person_id"] for r in db.rows(
        "SELECT DISTINCT d.person_id FROM push_subs s JOIN devices d ON d.id=s.device_id "
        "WHERE d.status='approved' AND d.person_id IS NOT NULL")}
    for pid in people:
        notify.enqueue(pid, "test", f"test:{at}", "Testmelding",
                       "Dit is een test van Reda. Als je dit ziet, werken je meldingen.", {"open": "home"}, t)
    if db.one("SELECT 1 AS x FROM push_subs s JOIN devices d ON d.id=s.device_id WHERE d.is_admin=1 AND d.person_id IS NULL"):
        notify.enqueue(notify.ADMIN, "test", f"test:{at}", "Testmelding", "Testmelding voor admin-toestellen.", {"open": "admin"}, t)
    log.info("testmelding klaargezet voor %d personen", len(people))


# ---- Certificaat ---------------------------------------------------------------

def cert_check():
    st = certstatus.read()
    if st.get("mode") != "letsencrypt" or not st.get("known"):
        return
    t = now_local().date()
    if not st["ok"]:
        notify.enqueue(notify.ADMIN, "cert", f"cert:{st.get('first_failure')}:{t}", "Certificaat vernieuwen mislukt",
                       "Tik om de debug-prompt voor Claude te openen.", {"open": "admin-cert"}, t)
    elif st.get("hours_left") is not None and st["hours_left"] < 48:
        notify.enqueue(notify.ADMIN, "cert", f"cert-bijna:{st.get('expires')}", "Certificaat verloopt bijna",
                       f"Nog {int(st['hours_left'])} uur geldig en nog niet vernieuwd.", {"open": "admin-cert"}, t)


# ---- Opruimen en GeoIP ---------------------------------------------------------

def cleanup():
    # Wachtende toestellen die na 7 dagen niets meer deden; locatie meteen mee weg
    db.run("DELETE FROM devices WHERE status='pending' AND last_seen < UTC_TIMESTAMP() - INTERVAL 7 DAY")
    db.run("UPDATE devices SET lat=NULL, lon=NULL, acc=NULL WHERE status<>'pending' AND lat IS NOT NULL")
    db.run("DELETE FROM link_codes WHERE expires_at < UTC_TIMESTAMP() - INTERVAL 1 DAY")
    db.run("DELETE FROM admin_codes WHERE expires_at < UTC_TIMESTAMP()")
    db.run("DELETE FROM notifications WHERE created_at < UTC_TIMESTAMP() - INTERVAL 14 DAY")
    db.run("DELETE FROM day_state WHERE day < CURDATE() - INTERVAL 3 DAY")
    db.run("DELETE FROM checkins WHERE day < CURDATE() - INTERVAL 14 DAY")
    db.run("DELETE FROM actions WHERE created_at < UTC_TIMESTAMP() - INTERVAL 30 DAY")
    db.run("DELETE FROM plans WHERE day < CURDATE() - INTERVAL 14 DAY")
    db.run("DELETE pm FROM plan_members pm LEFT JOIN plans p ON p.id=pm.plan_id WHERE p.id IS NULL")
    db.run("DELETE FROM push_subs WHERE device_id NOT IN (SELECT id FROM devices)")
    # Chat: gebeurtenissen na 30 dagen weg, getypte berichten na een jaar
    db.run("DELETE FROM chat_messages WHERE kind='event' AND created_at < UTC_TIMESTAMP() - INTERVAL 30 DAY")
    db.run("DELETE FROM chat_messages WHERE created_at < UTC_TIMESTAMP() - INTERVAL 365 DAY")


def update_geoip():
    """DB-IP Lite (gratis, CC BY 4.0) één keer per maand downloaden voor 'ruwe plaats' bij toegangsverzoeken."""
    path = geoip.PATH
    try:
        if os.path.exists(path) and time.time() - os.path.getmtime(path) < 32 * 86400:
            return
        month = dt.date.today().strftime("%Y-%m")
        status, _, data = fetch(f"https://download.db-ip.com/free/dbip-city-lite-{month}.mmdb.gz", max_bytes=200 * 1024 * 1024)
        if status != 200:
            return
        raw = gzip.decompress(data)
        tmp = path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(raw)
        os.replace(tmp, path)
        log.info("GeoIP-database bijgewerkt (%s)", month)
    except Exception as e:
        log.info("GeoIP niet bijgewerkt: %s", e)


# ---- Lus ---------------------------------------------------------------------

def main():
    db.init_schema(wait=120)
    notify.vapid()
    log.info("worker gestart")
    last_hourly = 0.0
    while True:
        started = time.time()
        for step in (run_syncs, day_notifications, chat_events, travel_notifications, cert_check, push_test,
                     notify.send_pending):
            try:
                step()
            except Exception:
                log.error("fout in %s:\n%s", step.__name__, traceback.format_exc())
        if started - last_hourly > 3600:
            last_hourly = started
            for step in (cleanup, update_geoip):
                try:
                    step()
                except Exception:
                    log.error("fout in %s:\n%s", step.__name__, traceback.format_exc())
        time.sleep(max(5, 60 - (time.time() - started)))


if __name__ == "__main__":
    main()
