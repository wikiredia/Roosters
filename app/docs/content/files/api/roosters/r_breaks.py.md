---
updated: 2026-10-24T05:26:38Z
---

Routes for **break requests** (`/api/v1/breaks`); the rules are in `breaks.py`. Everything needs a signed-in,
non-guest account (`deps.verified`), like friends. Every write answers with your whole list (`breaks`) and the
request it was about (`break`), so the app replaces its copy in one go. Asking (and another time) is rate-limited
to 30 an hour.

Errors (translated in `i18n.py`): `break_day`, `break_time`, `break_people`, `not_friends`, `break_busy_me`
(`reason`), `break_busy` (`people: [{id, reason}]`), 409 `break_dup` (`request`, `kind`, `state`), `break_gone`,
`break_over`.

## `list_breaks`

`GET /api/v1/breaks[?day=]`: requests from and to you, today and the coming two weeks (or one day).

## `BreakIn`, `ask`

`POST /api/v1/breaks` `{to_ids, day, start, end, mode, place, note}` → 201.

## `RespondIn`, `respond`

`POST /api/v1/breaks/{id}/respond` `{response: accepted|declined}`.

## `CounterIn`, `counter`

`POST /api/v1/breaks/{id}/counter` `{start, end, place?, note?}` → 201: 'Ander uur'.

## `cancel`

`POST /api/v1/breaks/{id}/cancel`: take back your own request.

## `_answer`

The answer of every write.
