import datetime as dt

from roosters import terms

D = dt.date


def test_default_year_runs_september_to_july_with_s2_from_february():
    y = terms.school_year(None, D(2026, 10, 24))
    assert y == terms.Year(D(2026, 9, 1), D(2027, 2, 1), D(2027, 7, 15))
    assert y.range(1) == (D(2026, 9, 1), D(2027, 1, 31))
    assert y.semester(D(2026, 10, 24)) == 1
    assert y.semester(D(2027, 3, 1)) == 2
    assert terms.school_year(None, D(2027, 3, 1)) == y


def test_summer_belongs_to_no_semester_and_points_at_the_coming_year():
    y = terms.school_year(None, D(2027, 8, 10))
    assert y.start == D(2027, 9, 1)
    assert y.semester(D(2027, 8, 10)) is None


def test_covers_follows_the_school_dates():
    school = {"year_start": "09-15", "s2_start": "02-10", "year_end": "06-30"}
    assert terms.covers(None, school, D(2026, 8, 1))
    assert terms.covers(1, school, D(2027, 2, 9))
    assert not terms.covers(1, school, D(2027, 2, 10))
    assert terms.covers(2, school, D(2027, 2, 10))
    assert not terms.covers(2, school, D(2027, 7, 1))


def test_bad_dates_fall_back_to_the_defaults():
    y = terms.school_year({"year_start": "13-40", "s2_start": None, "year_end": "x"}, D(2026, 10, 1))
    assert y == terms.Year(D(2026, 9, 1), D(2027, 2, 1), D(2027, 7, 15))


def test_out_tells_the_app_which_semester_it_is():
    out = terms.school_year(None, D(2027, 2, 3)).out(D(2027, 2, 3))
    assert out == {"s1": {"start": "2026-09-01", "end": "2027-01-31"},
                   "s2": {"start": "2027-02-01", "end": "2027-07-15"}, "current": 2}
