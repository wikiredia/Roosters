import datetime as dt

import pytest

from roosters import ics, netfetch
from roosters.config import TZ


@pytest.mark.parametrize("url", [
    "http://192.168.1.1/admin",
    "http://127.0.0.1/",
    "http://10.0.0.5/cal.ics",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "http://localhost/",
    "http://db:3306/",
])
def test_internal_addresses_are_refused(url):
    with pytest.raises(netfetch.FetchError):
        netfetch.fetch(url)


@pytest.mark.parametrize("url", [
    "file:///etc/passwd",
    "ftp://example.com/x.ics",
    "https://user:pass@example.com/x.ics",
    "https://example.com:3306/x.ics",
])
def test_bad_schemes_and_ports_are_refused(url):
    with pytest.raises(netfetch.FetchError):
        netfetch.check_url(netfetch.normalize_url(url))


def test_webcal_becomes_https():
    assert netfetch.normalize_url("webcal://p01-caldav.icloud.com/published/2/abc") == "https://p01-caldav.icloud.com/published/2/abc"


def _ics(events):
    body = "\n".join(events)
    return f"BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//t//EN\n{body}\nEND:VCALENDAR\n".encode()


def test_ics_recurring_and_keywords():
    today = dt.datetime.now(TZ).date()
    start = today.strftime("%Y%m%d")
    data = _ics([
        f"BEGIN:VEVENT\nUID:a\nDTSTART;TZID=Europe/Brussels:{start}T090000\nDTEND;TZID=Europe/Brussels:{start}T103000\n"
        "SUMMARY:Les Wiskunde\nLOCATION:A.1.02\nRRULE:FREQ=DAILY;COUNT=3\nEND:VEVENT",
        f"BEGIN:VEVENT\nUID:b\nDTSTART;TZID=Europe/Brussels:{start}T120000\nDTEND;TZID=Europe/Brussels:{start}T130000\n"
        "SUMMARY:Tandarts\nEND:VEVENT",
        f"BEGIN:VEVENT\nUID:c\nDTSTART;VALUE=DATE:{start}\nSUMMARY:Herfstvakantie\nEND:VEVENT",
    ])
    every = ics.parse(data)
    assert {l["title"] for l in every} == {"Les Wiskunde", "Tandarts"}  # hele-dag-afspraak telt niet
    only = ics.parse(data, {"keywords": ["les"]})
    assert len(only) == 3 and all(l["start_min"] == 540 and l["end_min"] == 630 for l in only)
    assert only[0]["location"] == "A.1.02"


def test_ics_garbage_is_refused():
    with pytest.raises(ics.IcsError):
        ics.parse(b"<html>not a calendar</html>")
