"""Lesson details: what a source tells about a lesson, broken into named fields, and each student's own
layout of them. "Labo · NOO.-01.019" becomes Type: Labo | Building: NOO | Floor: -01 | Classroom: 019.

Every school (and every calendar link) writes it differently, so nothing here is about one school or Untis:
`detect` looks at the values a source actually has and guesses how they break up; the student checks that
guess in onboarding (and in Settings → Timetable sources), can rename a field, merge fields ("-01" + "019" →
"-01.019") or hide one, and that layout is saved per *origin* (`detail_layouts`). New kinds of information
are a new key in FIELDS plus a value on the lesson (schedule.lesson_out); old layouts keep working.

A layout (JSON, version 1):
  {"v": 1,
   "split": {"sep": ".", "parts": ["building", "floor", "room"]},   # how a location breaks up, or null
   "fields": [{"keys": ["type"]}, {"keys": ["building"], "label": "Blok"},
              {"keys": ["floor", "room"], "label": "Lokaal"}, {"keys": ["group"], "hidden": true}]}
More than one key in a field = merged (location parts joined with the separator, others with " · ");
no label = the app's own name for the (first) key. The app does the splitting itself
(mobile/src/lib/details.ts): the timetable only carries the raw location, never a copy per field.

Origins: "untis:<school_id>" (every class of your school writes rooms the same way, so classmates' layouts
can be offered as a starting point) and "ics:<source_id>" (one calendar link; never shared).
Tested in tests/test_details.py."""
import json
import re
from collections import Counter

VERSION = 1
# Parts a location can break into (the app has a name for each), in the order a role is tried
PART_KEYS = ("campus", "building", "wing", "floor", "room")
GENERIC = tuple(f"part{i}" for i in range(1, 7))
# Everything a field can show: the kind of lesson, the location (whole or in parts), the student group
FIELDS = ("type", "location", *PART_KEYS, *GENERIC, "group")
# Tried in this order; on a tie the earlier one wins ("NOO.-01.019" splits on ".", not on "-")
SEPS = (".", " - ", " / ", "/", "_", "-", " ")
MAX_PARTS = 6
MIN_SHARE = 0.6  # this share of the rooms must break into the same number of parts
MAX_FIELDS = 12
MAX_LABEL = 24

_ROOMS_RE = re.compile(r"\s*,\s*")
_CODE_RE = re.compile(r"[A-Za-z]{1,4}\d?")  # NOO, MEI, B, A2: a building or wing code
_NUMBER_RE = re.compile(r"[+-]?\d{1,2}")  # -01, 0, 2: a floor
_LEVEL_RE = re.compile(r"[A-Za-z]{1,2}[+-]?\d{1,2}")  # K1, B-1, V2: a floor written with a letter
_NAME_RE = re.compile(r"[^\d]{5,}")  # Campus Noord, Paardenmarkt: a place by name


def rooms(locations) -> list[str]:
    """The single rooms in a list of locations ("NOO.-01.019, NOO.-01.020" is two)."""
    out = []
    for loc in locations:
        for r in _ROOMS_RE.split(loc or ""):
            if r.strip():
                out.append(r.strip())
    return out


def split_room(room: str, sep: str) -> list[str]:
    return [p.strip() for p in room.split(sep)]


def _best_split(rs: list[str]) -> tuple[str, int] | None:
    """The separator most rooms break up by, into the same number (2-6) of non-empty parts."""
    best = None
    for sep in SEPS:
        counts = Counter(len(ps) for ps in (split_room(r, sep) for r in rs) if 2 <= len(ps) <= MAX_PARTS and all(ps))
        if not counts:
            continue
        n, hits = counts.most_common(1)[0]
        share = hits / len(rs)
        if share >= MIN_SHARE and (best is None or share > best[2]):
            best = (sep, n, share)
    return (best[0], best[1]) if best else None


def _role(i: int, n: int, values: list[str], used: set[str]) -> str:
    """What position i of n holds, from its values: the last is the room, a name is the campus, a small
    number the floor, a short code the building (a second one the wing). Anything else: part<i+1>."""
    def fits(rx):
        return all(rx.fullmatch(v) for v in values)
    if i == n - 1:
        role = "room"
    elif fits(_NAME_RE):
        role = "campus"
    elif fits(_NUMBER_RE) or (i > 0 and "building" in used and fits(_LEVEL_RE)):
        role = "floor"
    elif fits(_CODE_RE):
        role = "building" if "building" not in used else "wing"
    else:
        role = GENERIC[i]
    return role if role not in used else GENERIC[i]


def detect_split(locations) -> dict | None:
    """How these locations break up, or None (no pattern most of them follow: the location stays whole)."""
    rs = list(dict.fromkeys(rooms(locations)))
    if not rs:
        return None
    found = _best_split(rs)
    if not found:
        return None
    sep, n = found
    columns = [[] for _ in range(n)]
    for r in rs:
        ps = split_room(r, sep)
        if len(ps) == n and all(ps):
            for i, p in enumerate(ps):
                columns[i].append(p)
    used: set[str] = set()
    parts = []
    for i in range(n):
        role = _role(i, n, columns[i], used)
        used.add(role)
        parts.append(role)
    return {"sep": sep, "parts": parts}


def detect(locations, has_group: bool = False) -> dict:
    """The layout we suggest for a source: its kind of lesson, its location (in parts if they follow a
    pattern) and the student group when the source has one."""
    split = detect_split(locations)
    fields = [{"keys": ["type"]}]
    fields += [{"keys": [k]} for k in split["parts"]] if split else [{"keys": ["location"]}]
    if has_group:
        fields.append({"keys": ["group"]})
    return {"v": VERSION, "split": split, "fields": fields}


def apply(layout: dict, kind: str | None, location: str | None, group: str | None = None) -> list[tuple[str, str]]:
    """(label or key, value) per shown field of one lesson: the Python twin of the app's lib/details.ts
    `detailRows` (tests and the console use it). A location that doesn't fit the split is shown whole, under
    the first field that holds a part of it."""
    split = layout.get("split")
    loc_keys = set(split["parts"]) if split else set()
    values: dict[str, list[str]] = {}
    if kind:
        values["type"] = [kind]
    if group:
        values["group"] = [group]
    whole = False
    if location:
        values["location"] = [location]
        rs = rooms([location])
        if split and all(len(split_room(r, split["sep"])) == len(split["parts"]) for r in rs):
            for r in rs:
                for key, v in zip(split["parts"], split_room(r, split["sep"])):
                    if v not in values.setdefault(key, []):
                        values[key].append(v)
        else:
            whole = bool(loc_keys)
    out = []
    for f in layout["fields"]:
        keys = f["keys"]
        if whole and any(k in loc_keys for k in keys):
            # Shown once, where the first part would have been (even if that field is hidden: it's not a part)
            out.append((f.get("label") or "location", location))
            whole = False
            continue
        if f.get("hidden"):
            continue
        got = [(k, ", ".join(values[k])) for k in keys if k in values]
        if not got:
            continue
        text = got[0][1]
        for (prev, _), (k, v) in zip(got, got[1:]):
            text += (split["sep"] if prev in loc_keys and k in loc_keys else " · ") + v
        out.append((f.get("label") or keys[0], text))
    return out


class Invalid(ValueError):
    pass


def clean(layout) -> dict:
    """A layout from the app, checked and normalised (known keys, each at most once, short labels).
    Raises Invalid."""
    if not isinstance(layout, dict):
        raise Invalid("layout")
    split = layout.get("split")
    if split is not None:
        if not isinstance(split, dict) or split.get("sep") not in SEPS:
            raise Invalid("split")
        parts = split.get("parts")
        if (not isinstance(parts, list) or not 2 <= len(parts) <= MAX_PARTS or len(set(parts)) != len(parts)
                or any(p not in PART_KEYS + GENERIC for p in parts)):
            raise Invalid("split")
        split = {"sep": split["sep"], "parts": list(parts)}
    allowed = {"type", "group", "location", *(split["parts"] if split else ())}
    fields_in = layout.get("fields")
    if not isinstance(fields_in, list) or not 1 <= len(fields_in) <= MAX_FIELDS:
        raise Invalid("fields")
    seen: set[str] = set()
    fields = []
    for f in fields_in:
        if not isinstance(f, dict):
            raise Invalid("fields")
        keys = f.get("keys")
        if not isinstance(keys, list) or not 1 <= len(keys) <= MAX_PARTS + 2:
            raise Invalid("fields")
        for k in keys:
            if k not in allowed or k in seen:
                raise Invalid("fields")
            seen.add(k)
        out = {"keys": list(keys)}
        label = f.get("label")
        if label is not None:
            if not isinstance(label, str):
                raise Invalid("label")
            label = " ".join(label.split())[:MAX_LABEL]
            if label:
                out["label"] = label
        if f.get("hidden"):
            out["hidden"] = True
        fields.append(out)
    return {"v": VERSION, "split": split, "fields": fields}


def canonical(layout: dict) -> str:
    """One string per layout, to compare and count them."""
    return json.dumps(layout, sort_keys=True, separators=(",", ":"))


def fits(layout: dict, locations) -> float:
    """The share of these locations the layout's split breaks up (1.0 without a split: shown whole)."""
    split = layout.get("split")
    rs = rooms(locations)
    if not split or not rs:
        return 1.0
    return sum(len(split_room(r, split["sep"])) == len(split["parts"]) for r in rs) / len(rs)


def examples(lessons: list[dict], limit: int = 4) -> list[dict]:
    """A few lessons that show the most: a location each, different kinds and rooms first, one with a group."""
    picked, kinds_seen, locs_seen = [], set(), set()
    ranked = sorted(lessons, key=lambda l: (not l.get("location"), not l.get("group")))
    for strict in (True, False):
        for l in ranked:
            if len(picked) >= limit:
                break
            key = (l.get("course"), l.get("location"))
            if any((p["course"], p["location"]) == key for p in picked):
                continue
            if strict and (l.get("kind") in kinds_seen or l.get("location") in locs_seen):
                continue
            picked.append({"course": l.get("course"), "kind": l.get("kind") or "other",
                           "location": l.get("location"), "group": l.get("group")})
            kinds_seen.add(l.get("kind"))
            locs_seen.add(l.get("location"))
    return picked
