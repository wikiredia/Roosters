"""Push notifications through Expo's push service (https://docs.expo.dev/push-notifications/sending-notifications/).

Two ways in, both a job (a slow or unreachable push service must never make a request wait):
- `notifications.enqueue` stores an in-app notification and queues `push` for that user; the job pushes what
  hasn't been pushed yet (break and access requests and answers, timetable changes), several changes of one day
  as one push. A request's push opens the chat with its card (`chat` in the notification's payload).
- `chat.send` queues `push_chat` for the message: everyone in the chat with the bell on gets it.

What reaches a phone: its session's token (`sessions.push_token`, set by the app via PUT /me/push-token), only
while that session is signed in; what you turned on in Meldingen (`push_settings`, per category), never in your
quiet hours (that push is dropped, the in-app notification stays). The texts are written here, in the user's
language (`users.locale`), because the app isn't running when they arrive.

Expo answers with a ticket per message; 15 minutes later `push_receipts` asks how delivery went. A token Expo calls
DeviceNotRegistered (app removed, permission taken back) is forgotten until the app registers it again.
PUSH_MODE=console only logs (tests, or a server that must not send)."""
import datetime as dt
import json
import logging
import re
import urllib.error
import urllib.request

from . import config, db, jobs, logic, schedule
from .errors import ApiError

log = logging.getLogger("roosters.push")

SEND_URL = "https://exp.host/--/api/v2/push/send"
RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
BATCH = 100                                 # messages per request (Expo's limit)
STALE = dt.timedelta(hours=6)               # not pushed by then (worker down): no longer news, only in the app
RECEIPTS_AFTER = dt.timedelta(minutes=15)   # Expo's advice; receipts are gone after 24 hours
MAX_BODY = 180
TOKEN = re.compile(r"^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,180}\]$")

# Notification kind -> category in Meldingen (also the Android channel the app creates)
CATEGORY = {"break_request": "requests", "break_counter": "requests", "break_answer": "requests",
            "break_cancelled": "requests", "access_request": "requests", "access_answer": "requests",
            "schedule_change": "changes"}
CATEGORIES = ("requests", "changes", "chat")
DEFAULTS = {"requests": True, "changes": True, "chat": True, "quiet_from": None, "quiet_until": None}


# ---- Pure parts --------------------------------------------------------------------

def valid_token(token: str | None) -> bool:
    return bool(token and TOKEN.match(token))


def quiet(s: dict, minute: int) -> bool:
    """In your quiet hours? `quiet_from` > `quiet_until` runs past midnight (22:00-07:30)."""
    a, b = s.get("quiet_from"), s.get("quiet_until")
    if a is None or b is None or a == b:
        return False
    return a <= minute < b if a < b else minute >= a or minute < b


_DAYS = {"nl": ("ma", "di", "wo", "do", "vr", "za", "zo"), "en": ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")}


def _day(day: dt.date, lang: str, today: dt.date) -> str:
    """vandaag / morgen / di 28/10."""
    if day == today:
        return "vandaag" if lang == "nl" else "today"
    if day == today + dt.timedelta(days=1):
        return "morgen" if lang == "nl" else "tomorrow"
    return f"{_DAYS[lang][day.weekday()]} {day.day}/{day.month}"


def _when(day: dt.date, start: int, lang: str, today: dt.date) -> str:
    """om 12:30 (today), morgen om 12:30, op di 28/10 om 12:30."""
    at = f"om {logic.fmt(start)}" if lang == "nl" else f"at {logic.fmt(start)}"
    if day == today:
        return at
    if day == today + dt.timedelta(days=1):
        return f"{_day(day, lang, today)} {at}"
    return f"op {_day(day, lang, today)} {at}" if lang == "nl" else f"on {_day(day, lang, today)} {at}"


def _short(text: str) -> str:
    text = " ".join(text.split())
    return text if len(text) <= MAX_BODY else text[:MAX_BODY - 1].rstrip() + "…"


def break_text(kind: str, p: dict, day: dt.date, name: str, lang: str, today: dt.date) -> tuple[str, str]:
    """(title, body) of a break request or what became of it."""
    when = _when(day, p.get("start", 0), lang, today)
    nl = lang == "nl"
    if kind == "break_request":
        return (("Pauze samen?", f"{name} wil pauze met jou {when}. Kan jij?") if nl else
                ("Break together?", f"{name} wants a break with you {when}. Can you?"))
    if kind == "break_counter":
        return (("Ander uur?", f"{name} stelt {when} voor. Kan jij?") if nl else
                ("Another time?", f"{name} suggests {when}. Can you?"))
    if kind == "break_answer" and p.get("response") == "accepted":
        return ("Pauze gepland", f"{name} kan {when}.") if nl else ("Break planned", f"{name} can make it {when}.")
    if kind == "break_answer" and p.get("was") == "accepted":
        return (("Pauze afgezegd", f"{name} kan toch niet {when}.") if nl else
                ("Break called off", f"{name} can't make it {when} after all."))
    if kind == "break_answer":
        return ("Geen pauze samen", f"{name} kan niet {when}.") if nl else ("No break together", f"{name} can't make it {when}.")
    return (("Pauze afgezegd", f"{name} zegt de pauze {when} af.") if nl else
            ("Break called off", f"{name} called off the break {when}."))


def access_text(kind: str, p: dict, name: str, lang: str) -> tuple[str, str]:
    """(title, body) of an access request ("Mag ik je rooster zien?") or the answer to it."""
    nl = lang == "nl"
    full = p.get("visibility") == "full"
    if kind == "access_request":
        what = ("je volledige rooster" if full else "je rooster (zonder lokalen)") if nl else \
            ("your full timetable" if full else "your timetable (without rooms)")
        return (("Mag ik je rooster zien?", f"{name} vraagt om {what} te zien.") if nl else
                ("Can I see your timetable?", f"{name} asks to see {what}."))
    if p.get("response") == "accepted":
        what = ("het volledige rooster" if full else "het rooster (zonder lokalen)") if nl else \
            ("their full timetable" if full else "their timetable (without rooms)")
        return ("Rooster gedeeld", f"{name} toont je nu {what}.") if nl else ("Timetable shared", f"{name} now shows you {what}.")
    return (("Geen toegang", f"{name} deelt het rooster liever niet.") if nl else
            ("No access", f"{name} would rather not share their timetable."))


def _moved(ch: dict, lang: str) -> list[str]:
    """What changed about a lesson: 10:30 → 13:00, B204 → C102, di → wo."""
    old = ch.get("old") or {}
    parts = []
    if old.get("day") and old["day"] != ch["day"]:
        parts.append(" → ".join(_DAYS[lang][dt.date.fromisoformat(d).weekday()] for d in (old["day"], ch["day"])))
    if old.get("start_min") is not None and old["start_min"] != ch["start_min"]:
        parts.append(f"{logic.fmt(old['start_min'])} → {logic.fmt(ch['start_min'])}")
    if old.get("location") != ch.get("location") and (old.get("location") or ch.get("location")):
        parts.append(f"{old.get('location') or '?'} → {ch.get('location') or '?'}")
    return parts


def change_text(changes: list[dict], lang: str, today: dt.date) -> tuple[str, str]:
    """(title, body) for the timetable changes of one day: one change in full, several in short."""
    nl = lang == "nl"
    day = _day(dt.date.fromisoformat(changes[0]["day"]), lang, today)
    if len(changes) == 1:
        ch = changes[0]
        course, at = ch["course"], logic.fmt(ch["start_min"])
        title = f"Roosterwijziging {day}" if nl else f"Timetable change {day}"
        if ch["type"] == "cancelled":
            return title, f"{course} vervalt ({at})." if nl else f"{course} is cancelled ({at})."
        if ch["type"] == "new":
            where = f", {ch['location']}" if ch.get("location") else ""
            return title, f"Extra les: {course} om {at}{where}." if nl else f"Extra class: {course} at {at}{where}."
        parts = _moved(ch, lang)
        if not parts:
            return title, f"{course} is gewijzigd ({at})." if nl else f"{course} has changed ({at})."
        return title, f"{course} verplaatst: {', '.join(parts)}." if nl else f"{course} moved: {', '.join(parts)}."
    words = {"cancelled": ("vervalt", "cancelled"), "new": ("extra", "extra"), "changed": ("verplaatst", "moved")}
    bits = [f"{ch['course']} {words.get(ch['type'], words['changed'])[0 if nl else 1]}" for ch in changes[:3]]
    if len(changes) > 3:
        bits.append(f"+{len(changes) - 3}")
    title = f"{len(changes)} roosterwijzigingen {day}" if nl else f"{len(changes)} timetable changes {day}"
    return title, _short(" · ".join(bits))


def chat_text(kind: str, chat_name: str | None, writer: str, body: str) -> tuple[str, str]:
    """A one-to-one chat: the writer as title. A group: the group, with who wrote it in front."""
    if kind == "group":
        return chat_name or writer, _short(f"{writer}: {body}")
    return writer, _short(body)


def build(notes: list[dict], names: dict[int, str], lang: str, today: dt.date) -> list[dict]:
    """The push messages (without `to`) for one user's new notifications. Timetable changes of the same day
    become one push that replaces an earlier one about that day (collapseId)."""
    out, changes = [], {}
    for n in notes:
        p, kind = n["payload"], n["kind"]
        if kind == "schedule_change":
            changes.setdefault(p["day"], []).append(p)
            continue
        name = names.get(p.get("from"), "?")
        if kind in ("access_request", "access_answer"):
            title, body = access_text(kind, p, name, lang)
        elif kind in CATEGORY and n["day"] is not None:
            title, body = break_text(kind, p, n["day"], name, lang, today)
        else:
            continue
        # Opens the chat with the request's card (older notifications without one: Today)
        chat = p.get("chat")
        m = {"title": title, "body": body, "channelId": "requests", "priority": "high", "sound": "default",
             "data": {"kind": kind, "request": p.get("request"), "chat": chat,
                      "url": f"/chat/{chat}" if chat else "/today"}}
        if kind in ("break_request", "break_counter"):
            # Ja / Nee / Ander uur on the notification (the app registers this category)
            m["categoryId"] = "break_request"
        out.append(m)
    for day, chs in sorted(changes.items()):
        title, body = change_text(chs, lang, today)
        out.append({"title": title, "body": body, "channelId": "changes", "sound": "default",
                    "collapseId": f"changes-{day}", "data": {"kind": "schedule_change", "day": day, "url": "/rooster"}})
    return out


# ---- Tokens and settings -----------------------------------------------------------

def register(session_id: int, token: str):
    """This phone's token, on its session. A token on another session (someone else signed in on this phone
    before) moves here: a phone only gets the pushes of who's signed in on it now."""
    if not valid_token(token):
        raise ApiError(400, "push_token")
    with db.tx() as c:
        db.run("UPDATE sessions SET push_token=NULL, push_token_at=NULL WHERE push_token=%s AND id<>%s",
               (token, session_id), c)
        db.run("UPDATE sessions SET push_token=%s, push_token_at=UTC_TIMESTAMP() WHERE id=%s", (token, session_id), c)


def unregister(session_id: int):
    db.run("UPDATE sessions SET push_token=NULL, push_token_at=NULL WHERE id=%s", (session_id,))


def forget(token: str):
    """Expo says this phone can't get pushes any more."""
    db.run("UPDATE sessions SET push_token=NULL, push_token_at=NULL WHERE push_token=%s", (token,))


def tokens_of(user_id: int) -> list[str]:
    return [r["push_token"] for r in db.rows(
        "SELECT DISTINCT push_token FROM sessions WHERE user_id=%s AND push_token IS NOT NULL "
        "AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()", (user_id,))]


def has_token(session_id: int) -> bool:
    return bool(db.one("SELECT 1 AS x FROM sessions WHERE id=%s AND push_token IS NOT NULL", (session_id,)))


def settings(user_id: int) -> dict:
    r = db.one("SELECT * FROM push_settings WHERE user_id=%s", (user_id,))
    if r is None:
        return dict(DEFAULTS)
    return {**{k: bool(r[k]) for k in CATEGORIES}, "quiet_from": r["quiet_from"], "quiet_until": r["quiet_until"]}


def save_settings(user_id: int, changes: dict) -> dict:
    """Only what's in `changes`; quiet hours go together (both a time, or both None = off)."""
    s = {**settings(user_id), **changes}
    if (s["quiet_from"] is None) != (s["quiet_until"] is None):
        raise ApiError(400, "invalid")
    db.run("INSERT INTO push_settings (user_id, requests, changes, chat, quiet_from, quiet_until) "
           "VALUES (%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE requests=VALUES(requests), changes=VALUES(changes), "
           "chat=VALUES(chat), quiet_from=VALUES(quiet_from), quiet_until=VALUES(quiet_until)",
           (user_id, *(1 if s[k] else 0 for k in CATEGORIES), s["quiet_from"], s["quiet_until"]))
    return settings(user_id)


# ---- Sending -----------------------------------------------------------------------

def _post(url: str, body) -> dict:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if config.EXPO_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {config.EXPO_ACCESS_TOKEN}"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        if e.code == 429 or e.code >= 500:
            raise jobs.Retry(f"Expo push answered {e.code}") from e
        raise RuntimeError(f"Expo push answered {e.code}: {e.read()[:300]!r}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise jobs.Retry(f"Expo push not reachable: {e}") from e


def _mask(token: str) -> str:
    return token[:22] + "…" if len(token) > 24 else token


def deliver(messages: list[dict]):
    """Hands the messages to Expo, 100 per request. A ticket that says DeviceNotRegistered forgets that token;
    the others are looked up again in 15 minutes (push_receipts)."""
    if not messages:
        return
    if config.PUSH_MODE != "expo":
        for m in messages:
            log.info("push to %s: %s | %s", _mask(m["to"]), m["title"], m["body"])
        return
    tickets = {}
    for i in range(0, len(messages), BATCH):
        part = messages[i:i + BATCH]
        answer = _post(SEND_URL, part)
        for m, t in zip(part, answer.get("data") or []):
            if t.get("status") == "ok" and t.get("id"):
                tickets[t["id"]] = m["to"]
            elif (t.get("details") or {}).get("error") == "DeviceNotRegistered":
                forget(m["to"])
            else:
                log.warning("push to %s refused: %s", _mask(m["to"]), t.get("message") or t)
        if answer.get("errors"):
            log.warning("push request errors: %s", answer["errors"])
    if tickets:
        jobs.enqueue("push_receipts", {"tickets": tickets}, run_at=db.utcnow() + RECEIPTS_AFTER, max_attempts=3)


def _user(user_id: int) -> dict | None:
    return db.one("SELECT u.*, sch.tz FROM users u LEFT JOIN schools sch ON sch.id=u.school_id "
                  "WHERE u.id=%s AND u.disabled_at IS NULL", (user_id,))


def _minute(now: dt.datetime) -> int:
    return now.hour * 60 + now.minute


@jobs.handler("push")
def _job_push(p: dict):
    """Everything not pushed yet for this user. Marked first, so a second worker never sends it twice; marked
    back if Expo can't be reached, so the retry still has it."""
    uid = p["user_id"]
    with db.tx() as c:
        notes = db.rows("SELECT * FROM notifications WHERE user_id=%s AND push=1 AND push_sent_at IS NULL "
                        "ORDER BY id FOR UPDATE", (uid,), c)
        if not notes:
            return
        marked, ids = db.in_list([n["id"] for n in notes])
        db.run(f"UPDATE notifications SET push_sent_at=UTC_TIMESTAMP() WHERE id IN ({marked})", ids, c)
    user = _user(uid)
    s = settings(uid)
    if user is None:
        return
    now = schedule.local_now(user)
    if quiet(s, _minute(now)):
        return
    notes = [{**n, "payload": db.unjs(n["payload"], {})} for n in notes
             if n["created_at"] > db.utcnow() - STALE and s.get(CATEGORY.get(n["kind"], ""), False)]
    tokens = tokens_of(uid)
    if not notes or not tokens:
        return
    people = {n["payload"].get("from") for n in notes} - {None}
    names = {}
    if people:
        ph, args = db.in_list(people)
        names = {r["id"]: r["display_name"] for r in db.rows(f"SELECT id, display_name FROM users WHERE id IN ({ph})", args)}
    messages = [{**m, "to": t} for m in build(notes, names, user["locale"], now.date()) for t in tokens]
    try:
        deliver(messages)
    except jobs.Retry:
        db.run(f"UPDATE notifications SET push_sent_at=NULL WHERE id IN ({marked})", ids)
        raise


@jobs.handler("push_chat")
def _job_push_chat(p: dict):
    """A message to everyone in the chat with the bell on: not the writer, not who blocked the writer, a one-to-one
    chat only while you're friends (like the chat itself), with chat on in Meldingen and outside quiet hours."""
    msg = db.one("SELECT * FROM chat_messages WHERE id=%s", (p["message_id"],))
    if msg is None or msg["deleted_at"] or msg["kind"] != "text" or msg["created_at"] < db.utcnow() - STALE:
        return
    chat = db.one("SELECT * FROM chats WHERE id=%s", (msg["chat_id"],))
    writer = db.one("SELECT display_name FROM users WHERE id=%s", (msg["user_id"],))
    if chat is None or writer is None:
        return
    members = db.rows("SELECT user_id FROM chat_members WHERE chat_id=%s AND push=1 AND user_id<>%s",
                      (chat["id"], msg["user_id"]))
    messages = []
    for m in members:
        uid = m["user_id"]
        if db.one("SELECT 1 AS x FROM blocks WHERE user_id=%s AND blocked_id=%s", (uid, msg["user_id"])):
            continue
        if chat["kind"] == "direct" and not db.one("SELECT 1 AS x FROM friendships WHERE user_id=%s AND friend_id=%s",
                                                   (uid, msg["user_id"])):
            continue
        user, s = _user(uid), settings(uid)
        if user is None or not s["chat"] or quiet(s, _minute(schedule.local_now(user))):
            continue
        title, body = chat_text(chat["kind"], chat["name"], writer["display_name"], msg["body"])
        for t in tokens_of(uid):
            messages.append({"to": t, "title": title, "body": body, "channelId": "chat", "priority": "high",
                             "sound": "default", "threadId": f"chat-{chat['id']}",
                             "data": {"kind": "chat", "chat": chat["id"], "url": f"/chat/{chat['id']}"}})
    deliver(messages)


@jobs.handler("push_receipts")
def _job_receipts(p: dict):
    """How delivery went, 15 minutes after sending. Only DeviceNotRegistered needs action (forget the token)."""
    tickets: dict = p.get("tickets") or {}
    if config.PUSH_MODE != "expo" or not tickets:
        return
    ids = list(tickets)
    for i in range(0, len(ids), 1000):
        answer = _post(RECEIPTS_URL, {"ids": ids[i:i + 1000]})
        for tid, r in (answer.get("data") or {}).items():
            if r.get("status") == "ok":
                continue
            if (r.get("details") or {}).get("error") == "DeviceNotRegistered" and tid in tickets:
                forget(tickets[tid])
            else:
                log.warning("push receipt %s: %s", tid, r.get("message") or r)


def send_test(user_id: int, lang: str) -> int:
    """A push to your own phones right away (debug screen). -> how many phones."""
    tokens = tokens_of(user_id)
    title, body = ("Roosters+", "Meldingen werken.") if lang == "nl" else ("Roosters+", "Notifications work.")
    deliver([{"to": t, "title": title, "body": body, "channelId": "requests", "sound": "default",
              "data": {"kind": "test", "url": "/today"}} for t in tokens])
    return len(tokens)
