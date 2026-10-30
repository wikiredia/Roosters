---
updated: 2026-10-30T15:00:00Z
---

**TypeScript shapes of the API's answers.** Keep them in sync with the server (`api/roosters/r_me.py`, `r_friends.py`, `r_schools.py`); the OpenAPI schema is at `/api/openapi.json`.

## `Visibility`

What a friend sees of your timetable: `full`, `norooms` (no rooms) or `freebusy`.

## `Friend`, `Together`, `Checkin`, `ScheduleChange`, `Notification`, `SourcesState`

Parts of the Today answer. A `Friend` has `pinned`: **you** pinned them (only yours, they never see it); the API
lists friends pinned first, then by name. `Checkin` is today's plan in two parts: `break_status` (your breaks
between classes: you'd like company, or you're busy) and `status` (after school: you stay, you'd like to chill; or
home / absent); each may be null.

## `Invite`, `PersonCard`, `Requests`, `Classmate`

Social.

## `PushSettings`, `Push`

Meldingen (`api/roosters/push.py`): requests, timetable changes, chat, and quiet hours (minutes since midnight,
both or neither); `Push` adds `device`, whether this phone is registered for push.

## `LessonState`, `Lesson`

A lesson: day, start/end minutes, busy, and (with detail) course, location, state, recently changed, `origin` (whose
layout breaks up its details) and Untis' student `group`; `skipped` on your own lessons that you skip (`lib/skips.ts`).

## `DetailField`, `DetailLayout`, `DetailExample`, `DetailOrigin`

Lesson details (`api/roosters/details.py` has the format; `lib/details.ts` uses it): a layout's split and fields, and
per origin of `GET /me/details` the layout to use, what was found, what schoolmates use and a few example lessons.

## `ClassLesson`, `ClassLessons`

A lesson of a class's whole timetable (with its group), and the answer of `…/classes/{id}/lessons`.

## `Source`, `School`, `Campus`, `SchoolClass`, `Courses`, `Semester`, `Terms`, `SchoolClasses`

Timetable sources (a class source has `semester`: 1, 2 or null for the whole year; `config.picked`: the courses were chosen one by one) and onboarding lists:
classes with the semesters they exist in plus the school year's semester dates (`Terms`), and courses with
`scanning` while the rest of the school year is still being fetched.

## `StatusCode`, `Status`

Now-board status codes and times (`break_busy`: in a break but said they're busy).

## `BreakRequest`, `BreakMode`, `BreakResponse`, `BreakPerson`

A break request (`api/roosters/breaks.py`). `mode` is as the one who asked put it: `lib/breaks.howText` turns it
into words from your side. Today carries them in `breaks` (optional: an API from before break requests leaves it out, and Today shows none instead of crashing). On a card in a chat it may also be `cancelled` or `over`.

## `AccessRequest`, `RequestRef`

"Mag ik je rooster zien?": a friend asks to see more of your timetable (`full` or `norooms`); a yes sets what you
show them. `RequestRef` is what a request card in a chat points at (its message's `payload`).

## `Chat`, `ChatDetail`, `ChatMessage`, `ChatEvent`, `ChatPerson`, `ReportReason`

Chat (`api/roosters/chat.py`): a chat in the list (one-to-one: the friend's name and colour, `with_id`; `push`: its
bell is on, only for you), one chat
with everyone in it and how far they read, a message (`body` null when taken back or removed), an event (the app
writes the sentence, `lib/chat.ts`), and the report reasons. A message of kind `request` is a card for a break or
access request (`components/chat/RequestCard.tsx`); it carries the request as it is now in `request`. `Chat.requests`:
open requests in that chat (the yellow 'Verzoek' tag in the Chat tab).

## `Today`, `Schedule`, `FriendSchedule`, `Compare`

`loading` on Today, Schedule and FriendSchedule: a week far back or ahead is still being fetched. A lesson has its
`kind`; a Schedule asked with `together=1` has the shared breaks per day.

Whole answers of the main screens.

## `Tokens`, `User`

The token answer (`account`: what the sign-in did, `new`, `existing` or `guest`; `lib/onboarding.routeAfterSignIn`), and your account (`guest`: started without signing in). `User.debug`: the owner's account, which gets the debug tools in every build.

## `Skip`, `SkipAnswer`

A class you skip, and the answer of `PUT /me/skips`: that day's skips and who you now share a break with.
