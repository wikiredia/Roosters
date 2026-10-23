---
updated: 2026-10-23T17:30:00Z
---

The admin API: the token is required (and the service answers 503 without one), the public API has no
admin routes, overview counts, adding/editing/deleting schools (slug rules, timezone check, the class-list
job, the activity log with the actor), a school in use can't be deleted, campuses, classes and sync, user
search / turn off / delete, jobs (run now, codes hidden), and the read-only table browser (masked secrets,
no SQL injection through the column name).

## `H`, `ac`

Admin headers (token + actor 'MacBook') and a TestClient for `roosters.admin`.
