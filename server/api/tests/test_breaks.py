import datetime as dt

from roosters.logic import PersonDay, day_info
from roosters.r_breaks import conflict, flip, mode_text, summarize, when_word

H = 60


def P(name, lessons, checkin=None):
    return PersonDay(1, name, [(a * H, b * H) for a, b in lessons], {1}, set(), set(), checkin)


def test_free_between_lessons_is_fine():
    p = P("Yeno", [(9, 10), (12, 13)])
    assert conflict(p, day_info(p), 10 * H, 12 * H) is None


def test_lesson_in_the_way():
    p = P("Yeno", [(9, 10), (11, 13)])
    assert conflict(p, day_info(p), 10 * H, 11 * H + 30) == "Yeno heeft dan les (11:00–13:00)"


def test_before_first_and_after_last_lesson_is_fine():
    p = P("Yeno", [(9, 10)])
    assert conflict(p, day_info(p), 8 * H, 9 * H) is None
    assert conflict(p, day_info(p), 10 * H, 11 * H) is None


def test_absent_home_and_no_school():
    absent = P("Yeno", [(9, 10)], {"status": "absent"})
    assert conflict(absent, day_info(absent), 10 * H, 11 * H, "morgen") == "Yeno is er morgen niet"
    home = P("Yeno", [(9, 10), (14, 15)], {"status": "home", "since_min": 11 * H})
    assert conflict(home, day_info(home), 12 * H, 13 * H) == "Yeno is al naar huis"
    none = P("Yeno", [])
    assert conflict(none, day_info(none), 10 * H, 11 * H) == "Yeno heeft vandaag geen les"


def test_chilling_without_lessons_counts_as_present():
    p = P("Yeno", [], {"status": "chilling", "since_min": 15 * H, "until_min": 18 * H})
    assert conflict(p, day_info(p), 16 * H, 17 * H) is None


def test_state_summary():
    assert summarize([{"response": "pending"}, {"response": "declined"}]) == "pending"
    assert summarize([{"response": "accepted"}, {"response": "declined"}]) == "planned"
    assert summarize([{"response": "declined"}]) == "declined"


def test_counter_proposal_flips_who_walks():
    assert flip("i_come") == "you_come"
    assert flip("you_come") == "i_come"
    assert flip("meet") == "meet"


def test_mode_text_from_both_sides():
    assert mode_text("i_come", None, "Reda") == "Reda komt naar jou"
    assert mode_text("you_come", None, "Reda") == "jij gaat naar Reda"
    assert mode_text("i_come", None, "Reda", ["Yeno"]) == "jij gaat naar Yeno"
    assert mode_text("you_come", None, "Reda", ["Yeno", "Kayra"]) == "Yeno & Kayra komen naar jou"
    assert mode_text("meet", "cafetaria", "Reda") == "op cafetaria"


def test_when_word():
    t = dt.date(2026, 10, 20)  # dinsdag
    assert when_word(t, t) == "vandaag"
    assert when_word(t + dt.timedelta(days=1), t) == "morgen"
    assert when_word(t + dt.timedelta(days=2), t) == "donderdag"
