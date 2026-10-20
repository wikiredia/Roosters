"""De API (achter Apache op /api/)."""
import logging
import urllib.parse

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from . import access, config, db, notify, r_access, r_admin, r_breaks, r_chat, r_overview, r_schedule, r_social

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("roosters")

app = FastAPI(title="Roosters", docs_url=None, redoc_url=None, openapi_url=None)


@app.on_event("startup")
def startup():
    db.init_schema()
    notify.vapid()


@app.middleware("http")
async def guard(request: Request, call_next):
    # CSRF: schrijfacties moeten van onze eigen pagina komen
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if request.headers.get("x-roosters") != "1":
            return JSONResponse({"code": "csrf", "message": "Ongeldig verzoek."}, status_code=403)
        origin = request.headers.get("origin")
        if origin:
            host = urllib.parse.urlsplit(origin).netloc
            if host != request.headers.get("host"):
                return JSONResponse({"code": "csrf", "message": "Ongeldig verzoek."}, status_code=403)
    response = await call_next(request)
    response.headers.setdefault("Cache-Control", "no-store")
    # Cookie bij elk bezoek vernieuwen (blijft zo 'voor altijd' geldig)
    tok = getattr(request.state, "renew_token", None)
    if tok:
        access.set_cookie(response, tok)
    return response


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "message": str(exc.detail or "Fout")}
    return JSONResponse(detail, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse({"code": "invalid", "message": "Ongeldige invoer."}, status_code=422)


@app.exception_handler(Exception)
async def crash(request: Request, exc: Exception):
    log.exception("Onverwachte fout op %s", request.url.path)
    return JSONResponse({"code": "server", "message": "Er ging iets mis op de server."}, status_code=500)


@app.get("/api/health")
def health():
    return {"ok": True, "tls": config.TLS_MODE}


for r in (r_access.router, r_schedule.router, r_social.router, r_admin.router, r_overview.router, r_breaks.router,
          r_chat.router):
    app.include_router(r)
