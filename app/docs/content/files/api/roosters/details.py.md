---
updated: 2026-10-30T09:29:00Z
---

**Lesson details as named fields.** What a source tells about a lesson ("Labo · NOO.-01.019") broken into fields
(Type: Labo | Building: NOO | Floor: -01 | Classroom: 019), and the format of each student's own **layout** of them.
Pure functions, no database: the routes are in `r_details.py`, the app's twin in `mobile/src/lib/details.ts`.

Nothing here is about one school or Untis. `detect` looks at the locations a source *actually* has and guesses how
they break up; the student checks that guess (onboarding step 6, `mobile/src/app/onboarding/details.tsx`), and can
rename a field, merge fields or hide one. **Adding a kind of information** = a key in `FIELDS`, a value on the lesson
(`schedule.lesson_out`), a name in the app (`lib/details.ts` `NAMES` + `details.*` texts) and a line in
`apply`/`detailRows`. Saved layouts keep working: a key they don't mention just isn't shown.

The layout (JSON, version 1):

```
{"v": 1,
 "split": {"sep": ".", "parts": ["building", "floor", "room"]},     # or null: the location stays whole
 "fields": [{"keys": ["type"]}, {"keys": ["building"], "label": "Blok"},
            {"keys": ["floor", "room"], "label": "Lokaal"}, {"keys": ["group"], "hidden": true}]}
```

More than one key = merged (location parts joined with the separator, "-01.019"; anything else with " · ").
No label = the app's own name for the key. The order of `fields` is the order shown.

What to watch out for: the free text from Untis is still never read here (only kind, location and student group
reach this module), and `apply` and the app's `detailRows` must give the same rows (`tests/test_details.py` has the
cases; change both together).

## `detect`, `detect_split`

The suggested layout: Type, the location (in parts if most rooms follow a pattern, else whole) and Group when the
source has student groups. `detect_split` tries the separators in `SEPS` and takes the one most rooms (at least
`MIN_SHARE`) break up by into the same number (2–6) of non-empty parts; on a tie the earlier separator wins, so
"NOO.-01.019" splits on "." and not on the minus.

## `_role`

What each position holds, from all its values: the last is the **room**, a name (5+ letters, no digits) the
**campus**, a small number (-01, 0, 2; or K1 after a building) the **floor**, a short code (NOO, A2) the **building**
(a second one the **wing**); anything else `part<n>`. A role is used once.

## `_best_split`

The separator and part count for `detect_split`.

## `rooms`, `split_room`

"NOO.-01.020, NOO.-01.021" is two rooms (Untis joins several rooms with ", ").

## `apply`

(title, value) per shown field for one lesson: the twin of the app's `detailRows`. A location that doesn't fit the
split ("Online", a sports hall) is shown whole where its first part would be. Several rooms give "020, 021".

## `clean`, `Invalid`

Checks a layout from the app: known keys only (location parts only those of its split), each at most once, at most
`MAX_FIELDS` fields, labels trimmed to `MAX_LABEL` characters. Raises `Invalid` (the route answers 400 `invalid`).

## `canonical`, `fits`

One string per layout (to count schoolmates' layouts and compare), and the share of a student's rooms a layout's
split breaks up (a suggestion must fit at least `MIN_SHARE`).

## `examples`

A few lessons to show a layout on: with a location, different kinds and rooms first, one with a group first.

## `VERSION`, `PART_KEYS`, `GENERIC`, `FIELDS`, `SEPS`, `MAX_PARTS`, `MIN_SHARE`, `MAX_FIELDS`, `MAX_LABEL`

The format's constants. A new key goes in `FIELDS` (and `PART_KEYS` when it's a piece of a location).
