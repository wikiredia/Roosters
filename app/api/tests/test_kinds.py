"""Kinds of lessons, from what real Untis timetables (AP, Oct 2026) say in their free text and subjects."""
import datetime as dt

from roosters import untis
from roosters.kinds import classify

from .test_sync import untis_week


def test_free_text_says_it_first():
    assert classify("Theorie") == "theory"
    assert classify("Labo - Minor Robotics") == "lab"
    assert classify("Theorie - Minor Start-Up") == "theory"
    assert classify("oefeningen") == "exercises"
    assert classify("workshop: dig.tools, klasmanagement") == "project"
    assert classify("Groepsleren coach") == "project"
    assert classify("WPL extern") == "internship"
    assert classify("1IT: Infosessie over de tussentijdse testen") == "info"
    assert classify("TS1 en TS2 peter-meter werking") == "support"


def test_then_the_subject():
    assert classify("", "Lab algemene chemie 1 (PR)", "IO-1CH_ALGCHEM1_PR") == "lab"
    assert classify(None, "Monitoraat SNB", "MDI_SNB_MON") == "support"
    assert classify(None, "Werkplekleren 3", "WPL3_stage") == "internship"


def test_names_that_look_like_a_kind_but_are_not():
    assert classify(None, "Informatica") == "other"
    assert classify(None, "Eventsupport: Administratie") == "other"
    assert classify(None, "Databases", "MDI_IT_DBS") == "other"


def test_flags_and_states():
    assert classify("Theorie", exam=True) == "exam"
    assert classify(None, event=True) == "info"


def test_parse_week_keeps_the_kind_but_not_the_text():
    d = dt.date(2026, 10, 20)
    data = untis_week(10220, d, [{"id": 1, "start": 830, "end": 1030, "subject": "Databases"}])
    data["elementPeriods"]["10220"][0]["lessonText"] = "Labo"
    (lesson,) = untis.parse_week(data, 10220)
    assert lesson["kind"] == "lab"
    assert "Labo" not in str(lesson)


def test_a_lesson_without_a_name_has_no_name_but_still_a_kind():
    """Nothing made up: no subject and no free text = no title (not 'Les'); the kind is 'other' (the app says 'Andere')."""
    d = dt.date(2026, 10, 20)
    data = untis_week(10220, d, [{"id": 1, "start": 830, "end": 1030, "subject": "Databases", "room": "B204"}])
    period = data["elementPeriods"]["10220"][0]
    period["elements"] = [r for r in period["elements"] if r["type"] == 4]  # the room only
    period["lessonText"] = ""
    (lesson,) = untis.parse_week(data, 10220)
    assert (lesson["course"], lesson["location"], lesson["kind"]) == ("", "B204", "other")
    # The free text names a lesson that has no subject
    period["lessonText"] = "Infosessie stage"
    (lesson,) = untis.parse_week(data, 10220)
    assert (lesson["course"], lesson["kind"]) == ("Infosessie stage", "internship")
