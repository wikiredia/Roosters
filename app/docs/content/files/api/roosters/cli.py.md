---
updated: 2026-10-23T17:30:00Z
---

**Admin commands** for a terminal, run inside the api container:
`docker compose exec api python -m roosters.cli <command>`. The console's Roosters+ tab does the same
things with a UI (and logs them); the CLI is for scripts and emergencies.

```
add-school ap "AP Hogeschool" --short AP --untis ap.webuntis.com --login ap
add-campus ap "Spoor Noord"
schools                     list schools with class counts and campuses
sync-class <class id>       fetch one class's timetable now, print the changes
debug                       mail settings, SMTP reachable?, worker running?, last login mails
test-mail you@example.com   send a mail right away and show the SMTP error, if any
```

## `add_campus`

Adds a campus to a school (by slug); ignores duplicates.

## `add_school`

Adds or updates a school by slug (and turns it back on), then queues the class-list fetch when it has an Untis server.

## `main`

Argument parsing; each subcommand sets `fn`.

## `schools`

Prints every school as one JSON line.

## `show_debug`, `test_mail`

`debug.diagnose()` and `debug.send_test_mail()` as JSON.

## `sync_class`

Runs `sync.sync_class` directly (not through the queue) and prints what changed.
