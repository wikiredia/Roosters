---
updated: 2026-10-23T17:30:00Z
---

Live docs ⇄ the Markdown in `app/docs/content`, run on the laptop:
- `status`: the to-do list (files without a doc, stale and orphaned entries);
- `pull`: write the live docs into `content/` (then commit, so git has a copy);
- `push [force]`: import `content/` into the live docs (after a git pull; newer repo copies win, `force`
  overwrites everything).

Reads `DOCS_URL` (default http://127.0.0.1:8095) and `DOCS_TOKEN` (from the environment or `app/.env`).
