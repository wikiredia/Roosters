---
updated: 2026-10-30T15:40:00Z
---

**Vergelijken's columns** (`app/compare.tsx`, step 2): you and the friends you picked side by side, a column each,
for one day, or two when you are at most three people (`maxDays`; more people and days is for Premium later).

- **Days**: Monday to Friday of one week on top (`DayPicker`), arrows for the week before and after, '1 dag / 2 dagen'
  when allowed. Opens on today, or next Monday at the weekend (`firstDay`).
- **Who**: 'Jij', then a card per friend (face and first name, only the face when narrow), + after the last one goes
  back to the friend list (`onAdd`). With two days the date sits above each group.
- **Your column** (`MyColumn`): your lessons as on the Rooster tab and your breaks as a dashed 'Vrij' (what's
  cancelled in it under the word).
- **A friend's column** (`FriendColumn`): their classes in pink (`FriendLesson`): 'Les', or the name and room only when
  they show you those; the API (`r_friends.friend_schedule`) already leaves out what you may not see. The breaks you
  share with them in yellow ('Samen', from your week's `together`).
- **Tap a break** (yours or a Samen): `PeopleSheet` with the mini timetable of your break (`breakTarget`).
- **Drag a friend's class into the bin** (`SkipDrag`: the columns are the drag's 'days', offset 0) asks them whether
  they'd skip it (`useAskSkip`). For you it is dashed and struck through ('Gevraagd') at once, with the break you'd
  share hatched over it (`MaybeTogether`); for them nothing changes until they say yes in the chat. A small dark note
  at the bottom says it was asked, and how long you'd share.

Data: `useWeeks` for your week, `useFriendSchedules` (one request per friend for the week), `useSkipAsks`.

## `CompareView`

`ids` (the friends, in order), `onAdd`, `premium` (not used yet).

## `maxDays`, `firstDay`

How many days fit for that many people; the day it opens on.

## `DayPicker`, `PersonCard`

The Monday–Friday strip with the days toggle; a friend's card above their column.

## `MyColumn`, `FriendColumn`, `FriendLesson`, `MaybeTogether`, `place`

The columns and their blocks; `place` puts a span at its height.

## `AXIS_W`, `HEAD_H`, `NARROW`, `Column`, `ColProps`, `T`

Sizes and shapes (`meets`, a span overlap test, sits next to them).
