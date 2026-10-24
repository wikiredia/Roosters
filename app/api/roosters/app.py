"""The Roosters+ API (v2). Every route lives under /api/v1; docs at /api/docs on the laptop."""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import config, i18n, r_auth, r_debug, r_friends, r_me, r_schools
from .deps import json_error, lang
from .errors import ApiError
from .idempotency import IdempotencyMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("roosters")

app = FastAPI(
    title="Roosters+ API",
    version="2.0",
    docs_url="/api/docs" if config.DEV else None,
    redoc_url=None,
    # The OpenAPI schema is always there: the app generates its TypeScript client from it
    openapi_url="/api/openapi.json",
)
app.add_middleware(IdempotencyMiddleware)
if config.CORS_ORIGINS:
    # Bearer tokens, no cookies: allowing the dev web build's origin is safe
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-If-None-Match", "Accept-Language"],
        expose_headers=["ETag", "X-Not-Modified", "Retry-After", "Idempotent-Replayed"],
        max_age=600,
    )


@app.middleware("http")
async def no_store(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.exception_handler(ApiError)
async def api_error(request: Request, exc: ApiError):
    return json_error(request, exc)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    code = {404: "not_found", 405: "invalid", 401: "auth_required", 403: "forbidden"}.get(exc.status_code, "invalid")
    return JSONResponse({"code": code, "message": i18n.error(code, lang(request))}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    fields = [".".join(str(x) for x in e.get("loc", ())[1:]) for e in exc.errors()]
    return JSONResponse({"code": "invalid", "message": i18n.error("invalid", lang(request)), "fields": fields},
                        status_code=422)


@app.exception_handler(Exception)
async def crash(request: Request, exc: Exception):
    log.exception("Unexpected error on %s", request.url.path)
    return JSONResponse({"code": "server", "message": i18n.error("server", lang(request))}, status_code=500)


@app.get("/api/v1/health")
def health():
    return {"ok": True}


for r in (r_auth.router, r_me.router, r_schools.router, r_friends.router, r_debug.router):
    app.include_router(r)
