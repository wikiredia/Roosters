---
updated: 2026-10-23T17:30:00Z
---

**CI check** (the `app-docs` workflow): every doc in `app/docs/content` must point at a file and symbols that
exist in the code. A renamed function whose doc heading wasn't updated, a deleted file or a typo fails the
build. Files without any doc are only a warning: the live To-do list tracks those.

Run it locally from `app/docs`: `python check_content.py`.

## `ROOT`

The `app/` folder (two levels up).

## `main`

Scan the code, read the content, report problems; exit code 1 when there are any.
