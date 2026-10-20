from roosters import events
from roosters.logic import PersonDay, day_info
from roosters.r_chat import clean_text, order_chats

H = 60


def P(pid, name, lessons, campus=(1,), checkin=None):
    return PersonDay(pid, name, [(a * H, b * H) for a, b in lessons], set(campus), set(), set(), checkin)


def world(*people):
    ppl = {p.id: p for p in people}
    return ppl, {pid: day_info(p) for pid, p in ppl.items()}


def test_clean_text_trims_and_limits_blank_lines():
    assert clean_text("  hoi  \n\n\n\n daar ") == "hoi\n\n daar"
    assert clean_text("   ") == ""
    assert len(clean_text("x" * 5000)) == 2000


def test_chats_order_friends_pinned_then_home_then_recent_dms():
    chats = [
        {"type": "dm", "title": "Yeno", "last": {"id": 5}},
        {"type": "home", "title": "Mechelen", "last": None},
        {"type": "dm", "title": "Kayra", "last": {"id": 9}},
        {"type": "friends", "title": "De vrienden", "last": {"id": 1}},
    ]
    assert [c["title"] for c in order_chats(chats)] == ["De vrienden", "Mechelen", "Kayra", "Yeno"]


def test_done_now_groups_people_ending_together():
    people, infos = world(P(1, "Reda", [(9, 12)]), P(2, "Yeno", [(9, 12)]), P(3, "Kayra", [(9, 14)]),
                          P(4, "Seba", [(9, 12)], checkin={"status": "home", "since_min": 11 * H}))
    assert events.done_now([1, 2, 3, 4], people, infos, 12 * H + 3) == [(12 * H, [1, 2])]
    assert events.done_now([1, 2, 3, 4], people, infos, 11 * H + 59) == []
    assert events.done_now([1, 2, 3, 4], people, infos, 12 * H + 10) == []
    assert events.done_text(["Reda"]) == "Reda stopt nu met de les"
    assert events.done_text(["Reda", "Yeno"]) == "Reda & Yeno stoppen nu met de les"


def test_breaks_starting_only_real_breaks():
    people, infos = world(P(1, "Reda", [(9, 10), (11, 12)]), P(2, "Yeno", [(9, 10), (11, 13)]),
                          P(3, "Kayra", [(9, 12)], checkin={"status": "want_chill", "until_min": 18 * H}))
    got = events.breaks_starting([1, 2, 3], people, infos, 10 * H + 2)
    assert [(m["ids"], m["start"], m["end"]) for m in got] == [([1, 2], 10 * H, 11 * H)]
    # Na school blijven chillen is geen 'pauze die begint'
    assert events.breaks_starting([1, 3], people, infos, 12 * H + 1) == []
    assert events.break_text(["Reda", "Yeno"], 11 * H) == "Reda & Yeno hebben nu samen pauze (tot 11:00)"
