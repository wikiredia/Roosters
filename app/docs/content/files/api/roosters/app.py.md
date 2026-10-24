---
updated: 2026-10-24T09:10:02Z
---

The **public API process** (`uvicorn roosters.app:app`, compose service `api`). It builds the FastAPI app,
adds the middleware and error handlers, and mounts the seven routers. Every route lives under `/api/v1`.

- Routers: `r_auth.py` (sign-in), `r_me.py` (your account, timetable, Today), `r_schools.py`
  (onboarding lists), `r_friends.py` (social), `r_breaks.py` (break requests), `r_chat.py` (chat), `r_debug.py` (laptop-only troubleshooting).
- The **admin API is a separate app** (`admin.py`) and is never mounted here, so `/admin/...` gives
  404 on the public port (`tests/test_admin.py` checks this).
- `/api/docs` (Swagger) exists only with `ENV=dev`; `/api/openapi.json` always exists, because the app
  generates its TypeScript types from it.
- Middleware order: `IdempotencyMiddleware` (replays retried writes, `idempotency.py`), CORS (only when
  `CORS_ORIGINS` is set, for the web build), then `no_store`.

**Adding a router:** create `r_<area>.py` with `router = APIRouter(prefix="/api/v1/...")`, add it to
the tuple at the bottom, and add tests under `api/tests/`.

## `api_error`, `http_error`, `validation_error`, `crash`

Every error comes back in the same shape: `{"code": "...", "message": "..."}`. The message is translated
(`i18n.py`) into the user's language. The app shows `message` and branches on `code`.
- `api_error`: our own `ApiError` (`errors.py`), which can carry extra fields such as `retry_after`.
- `http_error`: Starlette's 404/405/401/403, mapped to our codes.
- `validation_error`: a Pydantic body/query error becomes `invalid` with the list of `fields`.
- `crash`: anything unexpected is logged with its traceback, and the client gets `server` with no details.

## `health`

`GET /api/v1/health`: a liveness check for load balancers and the app's debug screen. It does not touch the database.

## `no_store`

Sets `Cache-Control: no-store` on every answer unless a route chose its own. `etag_json` (in `deps.py`) too: nothing the API answers is kept by the phone's HTTP cache. CORS allows the
app's `X-If-None-Match` and exposes `X-Not-Modified`.
