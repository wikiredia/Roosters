---
updated: 2026-10-23T17:30:00Z
---

**TypeScript shapes of the API's answers.** Keep them in sync with the server (`api/roosters/r_me.py`, `r_friends.py`, `r_schools.py`); the OpenAPI schema is at `/api/openapi.json`.

## `Friend`, `Together`, `Checkin`, `ScheduleChange`, `Notification`, `SourcesState`

Parts of the Today answer.

## `Invite`, `PersonCard`, `Requests`, `Classmate`

Social.

## `LessonState`, `Lesson`

A lesson: day, start/end minutes, busy, and (with detail) course, location, state, recently changed.

## `Source`, `School`, `Campus`, `SchoolClass`, `Courses`

Timetable sources and onboarding lists.

## `StatusCode`, `Status`

Now-board status codes and times.

## `Today`, `Schedule`, `FriendSchedule`, `Compare`

Whole answers of the main screens.

## `Tokens`, `User`

The token answer, and your account (`guest`: started without signing in).
