---
updated: 2026-10-24T08:00:00Z
---

**WebUntis**: find a school, list its classes, and fetch class timetables from the **public** view
(no login, no student accounts).

- Only what the app needs is kept: day, times, course, room, student group, state. **No teachers, no
  free text** (data minimisation).
- Every request to one Untis server is spaced 1 s apart across all workers (`redisx.throttle`), to stay
  polite. The job queue does the retrying.
- `check_server` allows only `*.webuntis.com`, so a school row can't make us fetch arbitrary hosts.

If Untis changes its public API, this is the file to fix; `tests/test_sync.py` has a recorded sample.

## `CLASS`, `SUBJECT`, `ROOM`

Untis element types (1 = class, 3 = subject, 4 = room).

## `SERVER_RE`, `check_server`

Only `<name>.webuntis.com` hosts are accepted.

## `SKIP_STATES`, `STATE_MAP`

Untis cell states: FREE is skipped; CANCEL → cancelled, substitutions/shifts → changed, ADDITIONAL → extra, EXAM → exam.

## `UntisError`

Untis didn't answer, or answered something unexpected.

## `_cookie`

Untis picks the school from a `schoolname` cookie: `_` + base64(login name).

## `_get_json`

One throttled GET with the school cookie, returning JSON or raising UntisError.

## `_minutes`

Untis `HHMM` (e.g. 1330) to minutes since midnight.

## `_week`

One week of one class's timetable data.

## `fetch_class`

This week and the next `WEEKS_AHEAD - 1` weeks of a class.

## `fetch_week`

One week of a class, parsed: what `sync.scan_courses` walks the school year with.

## `list_classes`

All classes of a school on one day (default today) from the public timetable page config; classes can differ per semester, so `sync.refresh_classes` asks for a day in each. A school without public class timetables gives an error (students can use their personal iCal link instead).

## `parse_week`

Untis' week format to our lesson dicts (uid, day, start_min, end_min, course, location, student_group, state,
kind). The free text (`lessonText`) is read only to tell the kind (`kinds.classify`, with the subject's long and
short name and the `is` flags), never kept.

## `search_schools`

Untis' own school search (what the Untis app uses): name, address, server, login. Used by the console's 'Add school'. Too many matches → Untis answers an error → `[]`.
