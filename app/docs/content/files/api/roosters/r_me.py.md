---
updated: 2026-10-23T17:30:00Z
---

**Your own account and timetable**: the routes behind the Today, Rooster and Me tabs. All need a
signed-in user (guests included: everything here works for guests).

- Profile: `GET/PATCH /api/v1/me`, ghost mode.
- Timetable sources: classes (`untis`) and calendar links (`ics`), hidden courses, manual refresh.
- Reading: `/schedule` (a week) and `/today` (everything the Today screen needs in one request, with an ETag).
- Check-in, notifications, export (GDPR) and account deletion.

Ghost mode, check-ins and sources change what **friends** see. That logic lives in `friends.py` and
`schedule.py`, and this file only stores them.

## `CheckinIn`, `checkin`

`PUT /api/v1/me/checkin`: today's status (chilling, want_chill, home, absent) or null to clear it. It changes your breaks (`logic.day_info`): chilling extends your free time after class, home cuts it.

## `GhostIn`, `ghost`

`PUT /api/v1/me/ghost`: hide from friends for N minutes, until you turn it off (-1), or show again (0). Friends then see you as 'hidden'.

## `HiddenIn`, `hide_course`

`PUT /api/v1/me/hidden-courses`: switch a course off or on for all your sources.

## `MAX_SOURCES`, `SOURCE_OUT`

At most 8 sources per user; the columns returned for a source.

## `ProfileIn`, `me`, `update_me`

`GET/PATCH /api/v1/me`. Changing school resets the campus unless one is given; the school must be active
and the campus must belong to it. `onboarded: true` sets `onboarded_at` once. The app sends it when you
finish **or skip** onboarding (`mobile/src/lib/onboarding.ts`), and from then on it always opens on Today.

## `UntisSourceIn`, `IcsSourceIn`, `SourceConfigIn`, `_clean`

Inputs for sources. Course names in include/exclude are trimmed, deduplicated and sorted.

## `_ts`

Datetime → ISO string with Z, or None.

## `add_ics`

`POST /api/v1/me/sources/ics`: a personal calendar link (Google, iCloud, Outlook, WebUntis iCal). The URL is checked (`netfetch.check_url`: public addresses only), stored **encrypted**, and fetched right away. Works without a school: that's the path for students whose school isn't on Roosters+.

## `add_untis`

`POST /api/v1/me/sources/untis`: follow a class of your school (400 `school_required` without one). If the class wasn't fetched recently it's queued **with high priority**: that's the onboarding 'aha' moment when your week appears.

## `delete_account`

`DELETE /api/v1/me`: deletes the account and everything linked to it, right away (`accounts.delete_user`). Required by the App Store and GDPR.

## `delete_source`

Soft-deletes the source, forgets its encrypted link and deletes its personal lessons.

## `export`

`GET /api/v1/me/export`: everything stored about you (GDPR art. 15/20) as JSON, without secrets (no encrypted links).

## `my_notifications`, `ReadIn`, `read`

List notifications (newest first, `after` for polling) and mark them read up to an id.

## `my_schedule`

`GET /api/v1/me/schedule?start=&days=`: your lessons for up to 28 days (default: this week), plus the sources' sync state, with an ETag.

## `refresh`

`POST /api/v1/me/refresh`: re-fetch all your sources now, at most once per 90 seconds (429 `refresh_cooldown`).

## `source_out`, `my_sources`

A source for the app. For a class, the **class's** sync state counts (it's shared); `syncing` is true until the first successful fetch, and the app polls while it is.

## `sources`

`GET /api/v1/me/sources`.

## `sources_state`

Summary for the app's banners: how many sources, oldest 'updated at', still syncing, which have errors.

## `today`

`GET /api/v1/me/today?day=`: **one round trip** for the Today screen (slow wifi): your status now, your
check-in, today's lessons, friends with their status on the now-board (sorted: on a break first),
who you share breaks with (`logic.partners`), today's and upcoming changes, and the sources' state.
With an ETag, so an unchanged screen costs a few bytes. Hidden (ghost) friends show as 'hidden' and are
left out of shared breaks.

## `update_source`

Change include/exclude (classes) or keywords and label (links). A link is fetched again when its keywords change.

## `user_out`

The user as the app sees it: name, e-mail, locale, school, campus, colour, ghost-until, `onboarded`, and `guest` (the app shows 'Confirm your e-mail' and hides friends for guests).
