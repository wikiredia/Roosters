---
updated: 2026-10-30T09:30:00Z
---

**A lesson's details as named fields**, after the layout of its origin (format and detection:
`api/roosters/details.py`; data: `GET /me/details`, `api/hooks.useDetails`). The timetable only carries the raw
location; it's broken up here when a lesson is opened (`components/timetable/LessonSheet.tsx`) and in the
onboarding step that edits layouts (`app/onboarding/details.tsx`).

`detailRows` is the twin of the API's `details.apply`: change both together (`api/tests/test_details.py` has the cases).

## `detailRows`, `DetailRow`

The rows a lesson shows: per field that isn't hidden and has a value, its title and value. Merged location parts are
joined with the split's separator ("-01.019"), anything else with " · ". A location that doesn't fit the split is
shown whole where its first part would be (`whole`). `kind` is the kind's name, already translated.

## `layoutFor`, `PLAIN`

The layout for a lesson's `origin`; without one (a friend at another school, nothing loaded yet) `PLAIN`: Type,
Location, Group.

## `keyName`, `fieldTitle`, `NAMES`

Our name per key (`details.*` texts; part1… is 'Part 1'), and a field's title: yours, else its keys' names joined
with ' + '.

## `rename`, `setHidden`, `mergeNext`, `unmerge`

Edits for the onboarding step; each returns a new layout. A title is trimmed to 24 characters (the API's
`MAX_LABEL`); merging keeps the first field's title; splitting gives it to the first part.

## `sameLayout`

Compares two layouts (what's saved, found or suggested) regardless of key order.

## `rooms`, `splitRoom`

"NOO.-01.020, NOO.-01.021" is two rooms.
