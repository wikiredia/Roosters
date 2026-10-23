---
updated: 2026-10-23T17:30:00Z
---

The docs service image: Python 3.12 slim with FastAPI and uvicorn, running as an unprivileged `docs` user. The code is mounted at `/src` (read-only) and the SQLite file lives in the `/data` volume, owned by that user.
