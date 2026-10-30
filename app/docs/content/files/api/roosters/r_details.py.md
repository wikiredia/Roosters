---
updated: 2026-10-30T09:29:00Z
---

**Your lesson details**, per origin: `GET /api/v1/me/details` and `PUT /api/v1/me/details/{origin}`. The logic is in
`details.py`; the app's screen is `mobile/src/app/onboarding/details.tsx` (onboarding step 6, and Settings →
Timetable sources → Class details), the lesson sheet uses the result (`mobile/src/lib/details.ts`).

An **origin** is one way of writing lessons: `untis:<school_id>` (all your Untis classes together: a school writes its
rooms the same way everywhere) or `ics:<source_id>` (one calendar link). Lessons say theirs
(`schedule.lesson_out` `origin`). Layouts live in `detail_layouts` (migration 0015).

**Sharing.** For Untis origins, the layout most schoolmates saved is offered as a starting point (`suggested`, with
how many use it) when it differs from yours and fits your rooms. Only titles and structure travel, never lessons;
calendar links are never shared. Friends' lessons keep `untis:` origins (you may use the same layout) but not `ics:`
ones (`r_friends.friend_schedule`).

## `my_details`

`GET /api/v1/me/details` (ETag): per origin `{origin, kind, name, saved, layout, detected, suggested, examples,
syncing}`. `layout` is yours once saved, else what `detect` found; `syncing` = nothing fetched yet to learn from
(the app asks again every few seconds).

## `save`, `LayoutIn`

`PUT /api/v1/me/details/{origin}` `{layout}`: checked with `details.clean` (400 `invalid`), saved (also when it's
exactly what we found, so it stays put as more lessons come in), answers the origin's new entry. 404 for an origin
that isn't yours.

## `origins`

Your origins, from your sources: one per school (with its class ids) and one per calendar link.

## `entry`

One origin's answer: samples its lessons, detects, reads what you saved (an unreadable saved layout counts as none),
and looks for a schoolmates' layout.

## `_sample`, `SAMPLE`

Up to 1500 lessons to learn from: your classes', or the whole school's while yours were never fetched; a calendar
link's own lessons.

## `_shared`, `SHARED_SAMPLE`

The most used layout among the last 500 saved by others for the same Untis origin that isn't yours and fits your
rooms (`details.fits`).

## `_mine`

The origin, if it's one of yours (else 404).
