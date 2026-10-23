---
updated: 2026-10-23T17:30:00Z
---

Second migration, for **skippable onboarding** and the **management console**:

- `users.is_guest`: accounts made without signing in (`POST /api/v1/auth/guest`). Guests use their own
  timetable; friends wait until they add a sign-in method (`deps.verified`).
- `users.disabled_at`: accounts turned off from the console (`admin.edit_user`).
- `admin_log`: every change made through the admin API, with the console device that made it.

## `admin_log`

actor (console device name), action (`school_add`, `user_edit`, ...), target, JSON detail, time.

## `users (alter at line 3)`, `users (alter at line 6)`

The two new `users` columns described above.
