---
updated: 2026-10-24T13:20:00Z
---

**TypeScript shapes of the API's answers.** Keep them in sync with the server (`api/roosters/r_me.py`, `r_friends.py`, `r_schools.py`); the OpenAPI schema is at `/api/openapi.json`.

## `Visibility`

What a friend sees of your timetable: `full`, `norooms` (no rooms) or `freebusy`.

## `Friend`, `Together`, `Checkin`, `ScheduleChange`, `Notification`, `SourcesState`

Parts of the Today answer.

## `Invite`, `PersonCard`, `Requests`, `Classmate`

Social.

## `PushSettings`, `Push`

Meldingen (`api/roosters/push.py`): requests, timetable changes, chat, and quiet hours (minutes since midnight,
both or neither); `Push` adds `device`, whether this phone is registered for push.

## `LessonState`, `Lesson`

A lesson: day, start/end minutes, busy, and (with detail) course, location, state, recently changed.

## `ClassLesson`, `ClassLessons`

A lesson of a class's whole timetable (with its group), and the answer of `…/classes/{id}/lessons`.

## `Source`, `School`, `Campus`, `SchoolClass`, `Courses`, `Semester`, `Terms`, `SchoolClasses`

Timetable sources (a class source has `semester`: 1, 2 or null for the whole year; `config.picked`: the courses were chosen one by one) and onboarding lists:
classes with the semesters they exist in plus the school year's semester dates (`Terms`), and courses with
`scanning` while the rest of the school year is still being fetched.

## `StatusCode`, `Status`

Now-board status codes and times.

## `BreakRequest`, `BreakMode`, `BreakResponse`, `BreakPerson`

A break request (`api/roosters/breaks.py`). `mode` is as the one who asked put it: `lib/breaks.howText` turns it
into words from your side. Today carries them in `breaks` (optional: an API from before break requests leaves it out, and Today shows none instead of crashing).

## `Chat`, `ChatDetail`, `ChatMessage`, `ChatEvent`, `ChatPerson`, `ReportReason`

Chat (`api/roosters/chat.py`): a chat in the list (one-to-one: the friend's name and colour, `with_id`; `push`: its
bell is on, only for you), one chat
with everyone in it and how far they read, a message (`body` null when taken back or removed), an event (the app
writes the sentence, `lib/chat.ts`), and the report reasons.

## `Today`, `Schedule`, `FriendSchedule`, `Compare`

`loading` on Today, Schedule and FriendSchedule: a week far back or ahead is still being fetched. A lesson has its
`kind`; a Schedule asked with `together=1` has the shared breaks per day.

Whole answers of the main screens.

## `Tokens`, `User`

The token answer, and your account (`guest`: started without signing in).
