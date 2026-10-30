# Working in this repo (agents)

- `app/` is **Roosters+** (v2): API + worker (`app/api`), the Expo app (`app/mobile`), the docs
  service (`app/docs`), all run with `app/docker-compose.yml`. `server/`, `site/`, `scripts/` and
  `desktop/` are the older v1 versions; leave them alone unless asked.
- Before changing anything under `app/`, read the Roosters+ docs: the hub
  (`app/docs/content/hub.md`, or live: `GET http://127.0.0.1:8095/docs/v1/hub`) says how the parts fit
  together and where to look; every file has a doc under `app/docs/content/files/`.
- **Every code change under `app/` updates its documentation in the same change.** The rules (what
  to document, the format, live API vs. Markdown in git, how to check) are in
  [`app/docs/README.md`](app/docs/README.md) → "For agents". Finish with `GET /docs/v1/status`
  (or `./app/docs/sync.sh status`): nothing you touched may be missing, stale or orphaned.
- Expo app: also read `app/mobile/AGENTS.md`.
- API tests need MySQL + Valkey: `docker compose -f app/docker-compose.test.yml up -d`, then
  `cd app/api && pytest`. Docs service tests: `cd app/docs && pytest`.
- **Don't block on slow commands.** The full API suite takes ~6 minutes: run the test files you touched first
  (`pytest tests/test_x.py`, seconds), and start the full suite in the background and keep working instead of
  waiting on it. Never set long timeouts (minutes) on a command you sit and wait for.
