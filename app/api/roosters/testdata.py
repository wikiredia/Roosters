"""Test people for trying the app on a laptop or test server: made-up friends with a made-up timetable, so you can
switch to them (r_debug.login_as) and see what a friend sees. Only reachable through r_debug.py (ENV=dev).

Test people are recognised by their e-mail domain (TEST_DOMAIN); removing them removes everything they have.
Their timetable is a personal calendar source without a link (sync never fetches it: `last_sync` far in the
future), filled with lessons from this week back to last week and three weeks ahead, different per person."""
import datetime as dt
import hashlib
import random

from . import accounts, db, friends, schedule, sync

TEST_DOMAIN = "roosters.test"
NAMES = ["Kayra", "Yeno", "Amir", "Lotte", "Noor", "Sem", "Lina", "Milan", "Ines", "Wout", "Elif", "Jonas"]
COURSES = [("Databases", "theory"), ("Databases Labo", "lab"), ("Python Advanced", "theory"), ("Netwerken Labo", "lab"),
           ("Cloud Computing", "theory"), ("DevOps", "exercises"), ("Security", "theory"), ("Project Web", "project")]
ROOMS = ["B204", "C102", "A.1.05", "D0.12", "E3.04", "B110"]
# Lessons start on these times (minutes); each lasts 1–2 hours
SLOTS = [8 * 60 + 30, 10 * 60 + 30, 12 * 60 + 30, 13 * 60 + 30, 15 * 60 + 30]
# Never fetched: sync only picks sources whose last_sync is in the past
NEVER = dt.datetime(2099, 1, 1)


def is_test(user: dict) -> bool:
    return (user.get("email") or "").endswith("@" + TEST_DOMAIN)


def lessons_for(user_id: int, first: dt.date, days: int) -> list[dict]:
    """A made-up timetable: 2–4 lessons a school day with breaks between, the same every time for the same person
    and day (seeded), sometimes a cancelled one. -> rows for source_lessons (without ids)."""
    out = []
    for i in range(days):
        day = first + dt.timedelta(days=i)
        if day.weekday() >= 5:
            continue
        rnd = random.Random(f"{user_id}:{day.isoformat()}")
        slots = sorted(rnd.sample(SLOTS, rnd.randint(2, 4)))
        end_of_last = 0
        for n, start in enumerate(slots):
            if start < end_of_last:
                continue
            course, kind = rnd.choice(COURSES)
            end = start + rnd.choice([60, 90, 120])
            end_of_last = end
            out.append({"uid": f"test:{day.isoformat()}:{n}", "day": day, "start_min": start, "end_min": end,
                        "course": course, "location": rnd.choice(ROOMS), "kind": kind,
                        "state": "cancelled" if rnd.random() < 0.08 else "normal"})
    return out


def give_timetable(c, user_id: int, today: dt.date) -> int:
    """(Re)places the test timetable of anyone (a test person, or your own account to try things): one source
    'Testrooster' with lessons from last week to three weeks ahead. -> how many lessons."""
    old = db.rows("SELECT id FROM sources WHERE user_id=%s AND label='Testrooster' AND kind='ics'", (user_id,), c)
    for s in old:
        db.run("DELETE FROM source_lessons WHERE source_id=%s", (s["id"],), c)
        db.run("DELETE FROM sources WHERE id=%s", (s["id"],), c)
    sid = db.run("INSERT INTO sources (user_id, kind, label, config, last_sync, last_ok) "
                 "VALUES (%s,'ics','Testrooster',%s,%s,UTC_TIMESTAMP())", (user_id, db.js({"test": True}), NEVER), c)
    monday = today - dt.timedelta(days=today.weekday())
    rows = lessons_for(user_id, monday - dt.timedelta(days=7), 35)
    db.many("INSERT INTO source_lessons (source_id, user_id, uid, day, start_min, end_min, course, location, kind, state, "
            "fingerprint) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            [(sid, user_id, r["uid"], r["day"], r["start_min"], r["end_min"], r["course"], r["location"], r["kind"],
              r["state"], sync.fingerprint(r)) for r in rows], c)
    return len(rows)


def create(me: dict, count: int, befriend: bool) -> list[int]:
    """`count` test people at your school and campus, onboarded, each with a test timetable; friends with you
    unless `befriend` is off. Names come from NAMES (then numbered)."""
    today = schedule.local_now(me).date()
    taken = {r["display_name"] for r in db.rows("SELECT display_name FROM users WHERE email LIKE %s", (f"%@{TEST_DOMAIN}",))}
    free = [n for n in NAMES if n not in taken] or [f"Test {len(taken) + i + 1}" for i in range(count)]
    made = []
    with db.tx() as c:
        for i in range(count):
            name = free[i] if i < len(free) else f"Test {len(taken) + i + 1}"
            tag = hashlib.sha1(f"{name}:{db.utcnow().isoformat()}:{i}".encode()).hexdigest()[:6]
            uid = db.run("INSERT INTO users (display_name, email, locale, school_id, campus_id, avatar_color, onboarded_at) "
                         "VALUES (%s,%s,%s,%s,%s,%s,UTC_TIMESTAMP())",
                         (name, f"{name.lower().replace(' ', '')}.{tag}@{TEST_DOMAIN}", me.get("locale") or "nl",
                          me.get("school_id"), me.get("campus_id"), random.randrange(8)), c)
            give_timetable(c, uid, today)
            if befriend and uid != me["id"]:
                friends.connect(c, me["id"], uid)
            made.append(uid)
    return made


def remove_all() -> int:
    """Removes every test person and everything they have. -> how many."""
    ids = [r["id"] for r in db.rows("SELECT id FROM users WHERE email LIKE %s", (f"%@{TEST_DOMAIN}",))]
    with db.tx() as c:
        for uid in ids:
            accounts.delete_user(c, uid)
    return len(ids)
