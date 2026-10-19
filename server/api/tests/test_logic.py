from roosters.logic import (
    PersonDay, campus_windows, day_info, now_status, pair_breaks, partners, travel_pairs,
)

H = 60


def m(v):
    """Kleine getallen zijn uren, grote al minuten."""
    return v * H if v < 24 else v


def P(pid, name, lessons, campus=(1,), home=(), checkin=None):
    return PersonDay(pid, name, [(m(a), m(b)) for a, b in lessons], set(campus), set(home), set(), checkin)


def infos(people):
    return {p.id: day_info(p) for p in people.values()}


def test_free_is_only_between_classes():
    p = P(1, "Nio", [(9, 10), (12, 13)])
    i = day_info(p)
    assert i.free == [(10 * H, 12 * H)]
    assert i.present


def test_no_school_is_not_free_time():
    i = day_info(P(1, "Nio", []))
    assert not i.present and i.free == []


def test_same_campus_needs_30_minutes():
    a = P(1, "Nio", [(9, 10), (10 * H + 25, 12 * H)])
    b = P(2, "Yarno", [(8, 10), (11, 12)])
    assert pair_breaks(a, b, day_info(a), day_info(b)) == []
    a2 = P(1, "Nio", [(9, 10), (10 * H + 30, 12 * H)])
    assert pair_breaks(a2, b, day_info(a2), day_info(b)) == [(10 * H, 10 * H + 30)]


def test_other_campus_needs_more_than_30_minutes():
    a = P(1, "Nio", [(9, 10), (10 * H + 30, 12 * H)], campus=(1,))
    b = P(2, "Yeno", [(8, 10), (11, 12)], campus=(2,))
    assert pair_breaks(a, b, day_info(a), day_info(b)) == []
    a2 = P(1, "Nio", [(9, 10), (12, 13)], campus=(1,))
    assert pair_breaks(a2, b, day_info(a2), day_info(b)) == [(10 * H, 11 * H)]


def test_staying_after_school_extends_free_time():
    a = P(1, "Seba", [(9, 12)], checkin={"status": "want_chill", "until_min": 18 * H})
    b = P(2, "Yarno", [(9, 13), (15, 17)])
    assert pair_breaks(a, b, day_info(a), day_info(b)) == [(13 * H, 15 * H)]


def test_going_home_cuts_breaks():
    a = P(1, "Seba", [(9, 10), (14, 15)], checkin={"status": "home", "since_min": 11 * H})
    b = P(2, "Yarno", [(9, 10), (14, 15)])
    ia, ib = day_info(a), day_info(b)
    assert ia.free == [(10 * H, 11 * H)]
    assert pair_breaks(a, b, ia, ib) == [(10 * H, 11 * H)]


def test_absent_has_no_breaks():
    a = P(1, "Seba", [(9, 10), (14, 15)], checkin={"status": "absent"})
    b = P(2, "Yarno", [(9, 10), (14, 15)])
    assert pair_breaks(a, b, day_info(a), day_info(b)) == []


def test_partners_and_campus_windows():
    people = {
        1: P(1, "Nio", [(9, 10), (12, 13)]),
        2: P(2, "Yarno", [(9, 11), (13, 14)]),
        3: P(3, "Yeno", [(8, 10), (12, 16)], campus=(2,)),
        4: P(4, "Yves", [(8, 9), (11, 12)], campus=(2,)),
    }
    inf = infos(people)
    got = partners(people[1], people, inf)
    assert {(x["id"], x["start"], x["end"], x["same_campus"]) for x in got} == {
        (2, 11 * H, 12 * H, True),
        (3, 10 * H, 12 * H, False),
        (4, 10 * H, 11 * H, False),
    }
    w = campus_windows(people, inf, {1: "AP Spoor Noord", 2: "UA Stadscampus"})
    assert [(x["name"], x["start"], x["end"], x["people"]) for x in w] == [
        ("UA Stadscampus", 10 * H, 11 * H, [3, 4]),
        ("AP Spoor Noord", 11 * H, 12 * H, [1, 2]),
    ]


def test_now_status():
    p = P(1, "Nio", [(9, 10), (12, 13)])
    i = day_info(p)
    assert now_status(p, i, 8 * H)["text"] == "Les om 9:00"
    assert now_status(p, i, 9 * H + 5)["text"] == "In les tot 10:00"
    assert now_status(p, i, 11 * H)["text"] == "Pauze tot 12:00"
    assert now_status(p, i, 14 * H)["text"] == "Klaar voor vandaag"


def test_travel_pairs_respect_prefs():
    people = {
        1: P(1, "Nio", [(8 * H + 30, 12 * H)], home=(9,)),
        2: P(2, "Yarno", [(8 * H + 40, 12 * H + 10)], home=(9,)),
        3: P(3, "Yeno", [(8 * H + 30, 12 * H)], home=(9,), campus=(2,)),
    }
    inf = infos(people)
    got = {(x["a"], x["b"], x["kind"]) for x in travel_pairs(people, inf, {})}
    assert got == {(1, 2, "heen"), (1, 2, "terug")}
    got = {(x["a"], x["b"], x["kind"]) for x in travel_pairs(people, inf, {(1, 2): "never", (3, 1): "always"})}
    assert got == {(1, 3, "heen"), (1, 3, "terug")}
