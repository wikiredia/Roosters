---
updated: 2026-10-31T20:11:00Z
---

## `FriendLane`

A friend's lane inside a day column (`DayGrid`, Vergelijken): their classes in their colour (`Lanes.friendColor`,
fill `soft`), with as much as fits (`Timetable.LessonBody`: name, details, time; 'Bezet' when they only share free/busy;
the API already leaves out what you may not see). Cancelled: dashed red on white. Asked to skip (your pending question):
dashed in their colour, struck through, 'Gevraagd', only on your phone until they answer. Touches go to the grid's
gestures (tap: the class's sheet without skipping; drag to the bin: ask them); screen readers read each class.
