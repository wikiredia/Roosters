"""Lesson details: breaking a source's data into fields (Type, Building, Floor, Classroom, ...), and each
student's own layout of them (rename, merge, hide), shared as a starting point with schoolmates."""
from roosters import db, details

from .conftest import add_class_lessons, befriend, login, onboard

AP = ["NOO.-01.019", "NOO.-01.020, NOO.-01.021", "MEI.02.105", "SPR.00.012"]


# ---- Detecting (pure) ---------------------------------------------------------------

def test_an_ap_room_breaks_into_building_floor_and_room():
    assert details.detect_split(AP) == {"sep": ".", "parts": ["building", "floor", "room"]}
    layout = details.detect(AP, has_group=True)
    assert [f["keys"] for f in layout["fields"]] == [["type"], ["building"], ["floor"], ["room"], ["group"]]
    assert details.apply(layout, "lab", "NOO.-01.019") == [
        ("type", "lab"), ("building", "NOO"), ("floor", "-01"), ("room", "019")]


def test_other_ways_of_writing_rooms():
    assert details.detect_split(["1.23", "2.04"]) == {"sep": ".", "parts": ["floor", "room"]}
    assert details.detect_split(["A2.1.05", "B.0.12"])["parts"] == ["building", "floor", "room"]
    assert details.detect_split(["PM.K1.04", "PM.V2.10"])["parts"] == ["building", "floor", "room"]
    assert details.detect_split(["Campus Noord - B.0.12"])["parts"] == ["campus", "floor", "room"]
    assert details.detect_split(["Gebouw A / 101", "Gebouw B / 202"]) == {"sep": " / ", "parts": ["campus", "room"]}
    # No pattern most rooms follow: the location stays whole
    assert details.detect_split(["Aula", "Sporthal", "Lokaal 12"]) is None
    assert [f["keys"] for f in details.detect(["Aula"])["fields"]] == [["type"], ["location"]]
    assert details.detect([]) == {"v": 1, "split": None, "fields": [{"keys": ["type"]}, {"keys": ["location"]}]}


def test_several_rooms_and_a_room_that_does_not_fit():
    layout = details.detect(AP)
    assert details.apply(layout, "theory", "NOO.-01.020, NOO.-01.021") == [
        ("type", "theory"), ("building", "NOO"), ("floor", "-01"), ("room", "020, 021")]
    # Online, a sports hall: shown whole where the first part would be
    assert details.apply(layout, "info", "Online") == [("type", "info"), ("location", "Online")]
    assert details.apply(layout, "info", None) == [("type", "info")]


def test_renaming_merging_and_hiding():
    layout = details.clean({"v": 1, "split": {"sep": ".", "parts": ["building", "floor", "room"]}, "fields": [
        {"keys": ["type"], "label": "  Soort   les "}, {"keys": ["building"], "label": "Blok"},
        {"keys": ["floor", "room"], "label": "Lokaal"}, {"keys": ["group"], "hidden": True}]})
    assert layout["fields"][0]["label"] == "Soort les"
    assert details.apply(layout, "lab", "NOO.-01.019", "1CH_A") == [
        ("Soort les", "lab"), ("Blok", "NOO"), ("Lokaal", "-01.019")]
    # Type and building in one field: not location parts both, so a dot
    merged = details.clean({**layout, "fields": [{"keys": ["type", "building"]}, {"keys": ["floor", "room"]}]})
    assert details.apply(merged, "lab", "NOO.-01.019") == [("type", "lab · NOO"), ("floor", "-01.019")]


def test_layouts_from_the_app_are_checked():
    good = details.detect(AP)
    for bad in (
        None, {}, {"split": None, "fields": []},
        {**good, "fields": [{"keys": ["type"]}, {"keys": ["type"]}]},  # a key twice
        {**good, "fields": [{"keys": ["teacher"]}]},  # unknown
        {"split": None, "fields": [{"keys": ["room"]}]},  # a part without a split
        {**good, "split": {"sep": "#", "parts": ["building", "room"]}},
        {**good, "fields": [{"keys": ["type"], "label": 5}]},
    ):
        try:
            details.clean(bad)
        except details.Invalid:
            continue
        raise AssertionError(f"accepted {bad}")
    long = details.clean({**good, "fields": [{"keys": ["type"], "label": "x" * 80}]})
    assert len(long["fields"][0]["label"]) == details.MAX_LABEL


def test_examples_show_the_most():
    lessons = [{"course": "Chemie", "kind": "theory", "location": "MEI.02.105", "group": None}] * 5 + [
        {"course": "Lab chemie", "kind": "lab", "location": "NOO.-01.019", "group": "1CH_A"},
        {"course": "Wiskunde", "kind": "exercises", "location": None, "group": None}]
    ex = details.examples(lessons)
    assert ex[0]["course"] == "Lab chemie"  # a location and a group first
    assert [e["course"] for e in ex][:2] == ["Lab chemie", "Chemie"]
    assert len({(e["course"], e["location"]) for e in ex}) == len(ex)


# ---- The API ------------------------------------------------------------------------

def _student(client, mails, school, email="ana@example.com"):
    s = login(client, email, mails)
    onboard(client, s, school, school["classes"][0])
    return s


def test_details_suggest_a_layout_from_your_classes(client, mails, school):
    add_class_lessons(school["classes"][0], [("08:30", "10:30", "Lab chemie", "NOO.-01.019"),
                                             ("10:45", "12:45", "Wiskunde", "MEI.02.105")])
    s = _student(client, mails, school)
    r = client.get("/api/v1/me/details", headers=s["headers"])
    assert r.status_code == 200, r.text
    [o] = r.json()["origins"]
    assert o["origin"] == f"untis:{school['id']}" and o["kind"] == "untis" and o["name"] == "AP Hogeschool"
    assert o["saved"] is False and o["syncing"] is False and o["suggested"] is None
    assert o["layout"] == o["detected"]
    assert o["layout"]["split"] == {"sep": ".", "parts": ["building", "floor", "room"]}
    assert {e["location"] for e in o["examples"]} == {"NOO.-01.019", "MEI.02.105"}
    # Your lessons say where their details come from
    lessons = client.get("/api/v1/me/schedule", headers=s["headers"]).json()["lessons"]
    assert lessons and all(lesson["origin"] == o["origin"] for lesson in lessons)


def test_a_class_not_fetched_yet_learns_from_the_school(client, mails, school):
    add_class_lessons(school["classes"][1], [("08:30", "10:30", "Fysica", "SPR.00.012")])
    s = _student(client, mails, school)
    [o] = client.get("/api/v1/me/details", headers=s["headers"]).json()["origins"]
    assert o["layout"]["split"]["parts"] == ["building", "floor", "room"]


def test_saving_your_layout(client, mails, school):
    add_class_lessons(school["classes"][0], [("08:30", "10:30", "Lab chemie", "NOO.-01.019")])
    s = _student(client, mails, school)
    [o] = client.get("/api/v1/me/details", headers=s["headers"]).json()["origins"]
    mine = {**o["layout"], "fields": [{"keys": ["type"], "label": "Soort"}, {"keys": ["building"], "label": "Gebouw"},
                                      {"keys": ["floor", "room"], "label": "Lokaal"}]}
    r = client.put(f"/api/v1/me/details/{o['origin']}", headers=s["headers"], json={"layout": mine})
    assert r.status_code == 200, r.text
    saved = r.json()["origin"]
    assert saved["saved"] is True and saved["layout"]["fields"][2] == {"keys": ["floor", "room"], "label": "Lokaal"}
    assert saved["detected"]["fields"][2] == {"keys": ["floor"]}
    # Saving again replaces it
    r = client.put(f"/api/v1/me/details/{o['origin']}", headers=s["headers"], json={"layout": o["detected"]})
    assert r.json()["origin"]["layout"] == o["detected"]
    assert db.one("SELECT COUNT(*) AS n FROM detail_layouts")["n"] == 1


def test_wrong_layouts_and_other_peoples_origins_are_refused(client, mails, school):
    s = _student(client, mails, school)
    origin = f"untis:{school['id']}"
    bad = {"split": None, "fields": [{"keys": ["type"]}, {"keys": ["type"]}]}
    assert client.put(f"/api/v1/me/details/{origin}", headers=s["headers"], json={"layout": bad}).status_code == 400
    ok = details.detect([])
    assert client.put("/api/v1/me/details/untis:999999", headers=s["headers"], json={"layout": ok}).status_code == 404
    assert client.put("/api/v1/me/details/ics:1", headers=s["headers"], json={"layout": ok}).status_code == 404


def test_a_schoolmates_layout_is_offered(client, mails, school):
    add_class_lessons(school["classes"][0], [("08:30", "10:30", "Lab chemie", "NOO.-01.019")])
    a = _student(client, mails, school, "ana@example.com")
    b = _student(client, mails, school, "bo@example.com")
    [o] = client.get("/api/v1/me/details", headers=a["headers"]).json()["origins"]
    theirs = {**o["layout"], "fields": [{"keys": ["type"]}, {"keys": ["building", "floor", "room"], "label": "Lokaal"}]}
    client.put(f"/api/v1/me/details/{o['origin']}", headers=a["headers"], json={"layout": theirs})
    [ob] = client.get("/api/v1/me/details", headers=b["headers"]).json()["origins"]
    assert ob["suggested"] == {"layout": details.clean(theirs), "users": 1}
    # Taken over: nothing left to suggest
    client.put(f"/api/v1/me/details/{o['origin']}", headers=b["headers"], json={"layout": theirs})
    [ob] = client.get("/api/v1/me/details", headers=b["headers"]).json()["origins"]
    assert ob["suggested"] is None and ob["saved"] is True


def test_calendar_links_have_their_own_layout_and_it_goes_with_the_link(client, mails, school):
    s = _student(client, mails, school)
    sid = db.run("INSERT INTO sources (user_id, kind, label, config) VALUES (%s,'ics','Sportclub','{}')", (s["user_id"],))
    origins = client.get("/api/v1/me/details", headers=s["headers"]).json()["origins"]
    assert [o["origin"] for o in origins] == [f"untis:{school['id']}", f"ics:{sid}"]
    assert origins[1]["syncing"] is True and origins[1]["suggested"] is None
    r = client.put(f"/api/v1/me/details/ics:{sid}", headers=s["headers"], json={"layout": details.detect([])})
    assert r.status_code == 200
    assert client.delete(f"/api/v1/me/sources/{sid}", headers=s["headers"]).status_code == 204
    assert db.one("SELECT COUNT(*) AS n FROM detail_layouts WHERE user_id=%s", (s["user_id"],))["n"] == 0


def test_friends_see_the_school_origin_but_not_the_link(client, mails, school):
    add_class_lessons(school["classes"][0], [("08:30", "10:30", "Lab chemie", "NOO.-01.019")])
    a = _student(client, mails, school, "ana@example.com")
    b = _student(client, mails, school, "bo@example.com")
    befriend(client, a, b)
    lessons = client.get(f"/api/v1/friends/{a['user_id']}/schedule", headers=b["headers"]).json()["lessons"]
    assert lessons and lessons[0]["origin"] == f"untis:{school['id']}"


def test_layouts_are_exported_and_deleted_with_the_account(client, mails, school):
    s = _student(client, mails, school)
    client.put(f"/api/v1/me/details/untis:{school['id']}", headers=s["headers"], json={"layout": details.detect([])})
    export = client.get("/api/v1/me/export", headers=s["headers"]).json()
    assert [r["origin"] for r in export["lesson_details_layouts"]] == [f"untis:{school['id']}"]
    assert client.delete("/api/v1/me", headers=s["headers"]).status_code == 204
    assert db.one("SELECT COUNT(*) AS n FROM detail_layouts")["n"] == 0
