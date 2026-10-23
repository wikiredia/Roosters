---
updated: 2026-10-23T17:30:00Z
---

**One image for the API, the worker, the admin API and the migrations** (compose builds it once as
`roostersplus-api` and runs it with different commands). Python 3.12 slim, dependencies installed as root,
then it runs as an unprivileged `app` user (uid 10001). Compose also makes the filesystem read-only and
drops all capabilities.

The default command (2 uvicorn workers, proxy headers, quiet logs) is for a server; on the laptop compose
overrides it with `--reload` and mounts the code, so saving a file restarts the API.
