from roosters.logic import PersonDay, also_free, compare_matches, day_info

H = 60


def P(pid, name, lessons, campus=(1,)):
    return PersonDay(pid, name, [(a * H, b * H) for a, b in lessons], set(campus), set(), set(), None)


def setup():
    people = {
        1: P(1, "Reda", [(9, 10), (11, 12)]),     # vrij 10-11
        2: P(2, "Yeno", [(9, 10), (11, 12)]),     # vrij 10-11
        3: P(3, "Kayra", [(8, 10), (11, 13)]),    # ook vrij 10-11
        4: P(4, "Corneel", [(9, 13)]),            # geen pauze
        5: P(5, "Seba", [(8, 10), (11, 12)]),     # vrij 10-11, maar onbekend
    }
    return people, {pid: day_info(p) for pid, p in people.items()}


def test_also_free_lists_known_people_free_during_the_match():
    people, infos = setup()
    matches = compare_matches([people[1], people[2]], infos)
    got = also_free(people, infos, [1, 2], matches, known={1, 2, 3, 4})
    assert [(a["id"], a["start"], a["end"], a["with"]) for a in got] == [(3, 10 * H, 11 * H, [1, 2])]


def test_also_free_without_a_match_uses_the_breaks_of_who_you_compare():
    people, infos = setup()
    got = also_free(people, infos, [1, 4], compare_matches([people[1], people[4]], infos), known={1, 2, 3, 4})
    assert {a["id"] for a in got} == {2, 3}


def test_also_free_skips_breaks_that_are_over():
    people, infos = setup()
    matches = compare_matches([people[1], people[2]], infos)
    assert also_free(people, infos, [1, 2], matches, known={3}, after=11 * H) == []
