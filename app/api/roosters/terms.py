"""School years and semesters. A school has `year_start`, `s2_start` and `year_end` as 'MM-DD':
S1 runs from year_start to the day before s2_start, S2 from s2_start to year_end. The summer in between
belongs to no semester. Pure functions (tested in tests/test_terms.py)."""
import datetime as dt
import functools
from typing import NamedTuple

DEFAULTS = {"year_start": "09-01", "s2_start": "02-01", "year_end": "07-15"}


class Year(NamedTuple):
    start: dt.date
    s2_start: dt.date
    end: dt.date

    def range(self, semester: int) -> tuple[dt.date, dt.date]:
        """First and last day of a semester (inclusive)."""
        return (self.start, self.s2_start - dt.timedelta(days=1)) if semester == 1 else (self.s2_start, self.end)

    def semester(self, day: dt.date) -> int | None:
        if self.start <= day < self.s2_start:
            return 1
        if self.s2_start <= day <= self.end:
            return 2
        return None

    def out(self, today: dt.date) -> dict:
        """For the app: both semesters and which one we're in."""
        s1, s2 = self.range(1), self.range(2)
        return {"s1": {"start": s1[0].isoformat(), "end": s1[1].isoformat()},
                "s2": {"start": s2[0].isoformat(), "end": s2[1].isoformat()},
                "current": self.semester(today)}


def _md(value: str | None, default: str) -> tuple[int, int]:
    try:
        m, d = (int(x) for x in (value or default).split("-"))
        dt.date(2024, m, d)  # a leap year: 02-29 is allowed (and becomes 02-28 in other years)
        return m, d
    except (ValueError, TypeError):
        m, d = (int(x) for x in default.split("-"))
        return m, d


def _date(year: int, md: tuple[int, int]) -> dt.date:
    m, d = md
    try:
        return dt.date(year, m, d)
    except ValueError:
        return dt.date(year, m, 28)


@functools.lru_cache(maxsize=1024)
def _year(year_start: str | None, s2_start: str | None, year_end: str | None, day: dt.date) -> Year:
    ys, s2, ye = _md(year_start, DEFAULTS["year_start"]), _md(s2_start, DEFAULTS["s2_start"]), \
        _md(year_end, DEFAULTS["year_end"])

    def build(y: int) -> Year:
        start = _date(y, ys)
        second = _date(y + 1 if s2 < ys else y, s2)
        end = _date(y + 1 if ye < ys else y, ye)
        return Year(start, second, end)

    y = build(day.year if (day.month, day.day) >= ys else day.year - 1)
    # In the summer after year_end: the coming school year is the one that counts
    return build(y.start.year + 1) if day > y.end else y


def school_year(school: dict | None, day: dt.date) -> Year:
    """The school year `day` falls in, or the coming one during the summer."""
    s = school or {}
    return _year(s.get("year_start"), s.get("s2_start"), s.get("year_end"), day)


def covers(semester: int | None, school: dict | None, day: dt.date) -> bool:
    """Does a class followed in `semester` (None = all year) count on this day?"""
    return semester is None or school_year(school, day).semester(day) == semester
