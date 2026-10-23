---
title: Management console and docs
position: 90
updated: 2026-10-23T18:55:00Z
---

The Smart-Room console (https://<laptop>:8443) has a **Roosters+** tab. It talks only to its own backend,
which reads `app/.env` and calls the two loopback-only services with their tokens:

```
browser ──> console :8443 ──> /api/roosters/admin/* ──> 127.0.0.1:8090/admin/v1/*  (ADMIN_TOKEN)
                          └─> /api/roosters/docs/*  ──> 127.0.0.1:8095/docs/v1/*   (DOCS_TOKEN)
```

| Section | What you can do |
| --- | --- |
| Documentation | This hub, guides, every file and function; edit with preview, history and restore; to-do list; routes; search |
| Overview | Counts, worker and mail health, test mail, migrations; compose Up/Restart, shells; **backups** (now, daily, download) |
| Schools & classes | Add (with Untis search), edit, turn off, delete schools; campuses; classes with sync state, fetch now |
| Users | Search, details (sign-in methods, devices, timetables, friends), edit, turn off, sign out everywhere, delete |
| Background jobs | Queue per kind, errors, run now, delete |
| Database | Every table, read-only, secrets masked, filter by column |
| Activity | Every change made through the admin API, with the device |
| Connection | Where `.env` is, tokens, both services up |

Code: `api/roosters/admin.py` (admin API), `docs/roostersdocs/` (docs service), and in the Smart-Room repo
`backend/roomctl/console/roosters.py` (proxy) and `console/web/js/roosters.js` (UI).

## Keeping the docs alive

- Edits in the console are **live** (SQLite in the `docs` volume, with history).
- The service scans the deployed code on every request: new files show up as missing, changed code
  makes docs **stale**, removed code makes them **orphaned** (the To-do list).
- Agents follow `docs/README.md`: on the laptop they write through the API; elsewhere they edit
  `app/docs/content/` in the same commit (imported at start; newer wins). `docs/sync.sh pull` copies live
  edits into git.
