---
updated: 2026-10-24T07:47:21Z
---

Eighth migration: a third choice for what a friend sees of your timetable, **everything but the rooms** (`norooms`:
what and when, never where), next to `full` and `freebusy` (`r_friends.set_visibility`, `friend_schedule`).

## `friendships (alter at line 3)`

`visibility` becomes `ENUM('full','norooms','freebusy')`.
