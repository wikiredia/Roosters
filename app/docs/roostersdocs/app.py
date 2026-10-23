"""Roosters+ docs service: the live architecture documentation behind the console's Roosters+ tab.

    uvicorn roostersdocs.app:app        (compose service `docs`, 127.0.0.1:8095)

Reading is open (it listens on loopback only); writing needs `Authorization: Bearer <DOCS_TOKEN>` and
names its author in `X-Docs-Author` (an agent: "claude", a person: their name).

Environment: DOCS_SRC (the code, read-only), DOCS_DB (SQLite file), DOCS_CONTENT (repo Markdown to
import at start, default DOCS_SRC/docs/content), DOCS_TOKEN."""
import hmac
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

from . import content, scan
from .store import Store, file_key, normalize_symbol, now, page_key, sym_key

SRC = os.environ.get("DOCS_SRC", "/src")
DB = os.environ.get("DOCS_DB", "/data/docs.sqlite")
CONTENT = os.environ.get("DOCS_CONTENT", str(Path(SRC) / "docs" / "content"))
TOKEN = os.environ.get("DOCS_TOKEN", "")

store = Store(DB)
scanner = scan.Scanner(SRC)


@asynccontextmanager
async def lifespan(_app):
    import_content()
    yield


app = FastAPI(title="Roosters+ docs", version="1.0", docs_url=None, redoc_url=None, openapi_url="/docs/openapi.json",
              lifespan=lifespan)


# ---- Helpers ---------------------------------------------------------------------

def writer(request: Request) -> str:
    """Write access: the docs token. -> the author name stored with the revision."""
    header = request.headers.get("authorization") or ""
    if len(TOKEN) < 32:
        raise HTTPException(503, "Read-only: set DOCS_TOKEN (32+ characters) in app/.env and restart the docs service.")
    if not header.lower().startswith("bearer ") or not hmac.compare_digest(header[7:].strip(), TOKEN):
        raise HTTPException(401, "Writing needs the docs token.")
    return (request.headers.get("x-docs-author") or "unknown").strip()[:80] or "unknown"


def _sym_hash(f: scan.File, symbol: str) -> str | None:
    """Hash of one symbol, or of a group ('a,b'): changes when any member's code changes."""
    names = symbol.split(",")
    by_name = {s.name: s for s in f.symbols}
    if not all(n in by_name for n in names):
        return None
    return "+".join(by_name[n].hash for n in sorted(names))


def _file(path: str) -> scan.File:
    f = scanner.files().get(path)
    if f is None:
        raise HTTPException(404, f"No such file in the code: {path}")
    return f


def _entry_state(e: dict, files: dict[str, scan.File]) -> str:
    """fresh / stale (code changed since the doc was written) / orphan (the code is gone)."""
    if e["kind"] == "page":
        return "fresh"
    f = files.get(e["path"])
    if f is None:
        return "orphan"
    if e["kind"] == "file":
        return "fresh" if e["code_hash"] == f.hash else "stale"
    current = _sym_hash(f, e["symbol"])
    if current is None:
        return "orphan"
    return "fresh" if e["code_hash"] == current else "stale"


def _summary(text: str) -> str:
    """The first sentence-like line: headings, tables, code fences and diagrams are skipped."""
    fence = False
    for line in (text or "").splitlines():
        line = line.strip()
        if line.startswith("```"):
            fence = not fence
            continue
        if fence or not line or line.startswith(("#", "|", "---")):
            continue
        return re.sub(r"[*`]", "", line.lstrip("-*> ").lstrip("0123456789. ")).strip()[:200]
    return ""


def import_content(force: bool = False) -> dict:
    """Repo Markdown -> store: add what's missing, replace what the repo has newer (or everything: force)."""
    files = scanner.files()
    added = replaced = kept = 0
    for e in content.read_tree(Path(CONTENT)):
        # A date in the future (a typo, a wrong clock) would win over every live edit until then: cap it at now
        e["updated"] = min(e["updated"], now()) if e["updated"] else ""
        live = store.get(e["key"])
        if live and not force and (not e["updated"] or e["updated"] <= live["updated_at"]):
            kept += 1
            continue
        code_hash = None
        if e["kind"] == "file" and e["path"] in files:
            code_hash = files[e["path"]].hash
        elif e["kind"] == "sym" and e["path"] in files:
            code_hash = _sym_hash(files[e["path"]], e["symbol"])
        store.put(e["key"], kind=e["kind"], body=e["body"], author="repo", title=e.get("title", ""),
                  path=e.get("path"), symbol=e.get("symbol"), position=e.get("position"), code_hash=code_hash,
                  note="imported from app/docs/content", at=e["updated"] or now())
        if live:
            replaced += 1
        else:
            added += 1
    return {"added": added, "replaced": replaced, "kept": kept}


# ---- Hub and pages ---------------------------------------------------------------

@app.get("/docs/health")
def health():
    return {"ok": True, "writable": len(TOKEN) >= 32, "files": len(scanner.files()), "entries": store.counts()}


@app.get("/docs/v1/hub")
def hub():
    """The start page: the hub text, the guides, and how complete the docs are."""
    pages = store.all("page")
    return {"hub": next((p for p in pages if p["key"] == "page:hub"), None),
            "guides": [{"slug": p["key"][5:], "title": p["title"], "summary": _summary(p["body"]),
                        "updated_at": p["updated_at"], "position": p["position"]}
                       for p in pages if p["key"] != "page:hub"],
            "coverage": status()["coverage"]}


@app.get("/docs/v1/pages/{slug}")
def page(slug: str):
    p = store.get(page_key(slug))
    if p is None:
        raise HTTPException(404, "No such page")
    return {"page": p}


class PageIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(max_length=400_000)
    position: int | None = None
    note: str | None = Field(None, max_length=300)


@app.put("/docs/v1/pages/{slug}")
def put_page(slug: str, body: PageIn, author: str = Depends(writer)):
    if not slug.replace("-", "").isalnum() or len(slug) > 60:
        raise HTTPException(400, "Slug: letters, digits and dashes")
    return {"page": store.put(page_key(slug), kind="page", title=body.title, body=body.body, author=author,
                              position=body.position, note=body.note)}


@app.delete("/docs/v1/pages/{slug}", status_code=204)
def delete_page(slug: str, author: str = Depends(writer)):
    if slug == "hub":
        raise HTTPException(400, "The hub can be edited, not deleted")
    if not store.delete(page_key(slug), author):
        raise HTTPException(404, "No such page")


# ---- Files and symbols -----------------------------------------------------------

@app.get("/docs/v1/tree")
def tree():
    """Every file in the code with its description and how well it's documented."""
    files = scanner.files()
    by_path: dict[str, list[dict]] = {}
    for e in store.all():
        if e["path"]:
            by_path.setdefault(e["path"], []).append(e)
    out = []
    for path, f in sorted(files.items()):
        entries = by_path.get(path, [])
        fdoc = next((e for e in entries if e["kind"] == "file"), None)
        covered: set[str] = set()
        stale = 0
        for e in entries:
            if e["kind"] == "sym":
                state = _entry_state(e, files)
                if state != "orphan":
                    covered.update(e["symbol"].split(","))
                stale += state == "stale"
        out.append({"path": path, "lang": f.lang, "lines": f.lines,
                    "summary": _summary(fdoc["body"]) if fdoc else _summary(f.comment),
                    "documented": fdoc is not None, "stale": (fdoc is not None and _entry_state(fdoc, files) == "stale")
                    or stale > 0, "symbols": len(f.symbols),
                    "symbols_documented": sum(1 for s in f.symbols if s.name in covered or s.comment)})
    return {"files": out}


@app.get("/docs/v1/file")
def file(path: str):
    """One file: its doc, and every symbol with the code's own comment and the written doc (if any)."""
    files = scanner.files()
    f = _file(path)
    entries = store.for_path(path)
    fdoc = next((e for e in entries if e["kind"] == "file"), None)
    groups = []
    by_symbol: dict[str, dict] = {}
    for e in entries:
        if e["kind"] != "sym":
            continue
        e = dict(e, state=_entry_state(e, files), members=e["symbol"].split(","))
        groups.append(e)
        for name in e["members"]:
            by_symbol.setdefault(name, e)
    return {
        "file": {"path": f.path, "lang": f.lang, "lines": f.lines, "hash": f.hash, "comment": f.comment},
        "doc": dict(fdoc, state=_entry_state(fdoc, files)) if fdoc else None,
        "symbols": [{"name": s.name, "kind": s.kind, "line": s.line, "end": s.end, "signature": s.signature,
                     "comment": s.comment, "route": s.route, "parent": s.parent,
                     "doc_key": by_symbol[s.name]["key"] if s.name in by_symbol else None} for s in f.symbols],
        "docs": groups,
    }


class FileDocIn(BaseModel):
    path: str = Field(min_length=1, max_length=400)
    symbol: str | None = Field(None, max_length=400, description="name, or 'a,b' for a group; empty = the file")
    body: str = Field(max_length=200_000)
    note: str | None = Field(None, max_length=300)


@app.put("/docs/v1/file")
def put_file_doc(body: FileDocIn, author: str = Depends(writer)):
    f = _file(body.path)
    if body.symbol and normalize_symbol(body.symbol):
        symbol = normalize_symbol(body.symbol)
        code_hash = _sym_hash(f, symbol)
        if code_hash is None:
            known = ", ".join(s.name for s in f.symbols)
            raise HTTPException(400, f"Unknown symbol in {body.path}: {symbol}. Known: {known}")
        e = store.put(sym_key(body.path, symbol), kind="sym", path=body.path, symbol=symbol, body=body.body.strip(),
                      author=author, code_hash=code_hash, note=body.note)
    else:
        e = store.put(file_key(body.path), kind="file", path=body.path, body=body.body.strip(), author=author,
                      code_hash=f.hash, note=body.note)
    return {"entry": dict(e, state="fresh")}


class ConfirmIn(BaseModel):
    path: str
    symbol: str | None = None


@app.post("/docs/v1/confirm")
def confirm(body: ConfirmIn, author: str = Depends(writer)):
    """'Still correct': the code changed but the doc doesn't need to; clears the stale flag."""
    key = sym_key(body.path, body.symbol) if body.symbol else file_key(body.path)
    e = store.get(key)
    if e is None:
        raise HTTPException(404, "No doc to confirm")
    f = _file(body.path)
    code_hash = _sym_hash(f, e["symbol"]) if e["kind"] == "sym" else f.hash
    return {"entry": store.put(key, kind=e["kind"], path=e["path"], symbol=e["symbol"], body=e["body"],
                               author=author, code_hash=code_hash, note="confirmed: still correct")}


@app.delete("/docs/v1/file", status_code=204)
def delete_file_doc(path: str, symbol: str = "", author: str = Depends(writer)):
    key = sym_key(path, symbol) if symbol else file_key(path)
    if not store.delete(key, author):
        raise HTTPException(404, "No such doc")


@app.get("/docs/v1/source")
def source(path: str, start: int = 1, end: int | None = None):
    try:
        return PlainTextResponse(scanner.source(path, start, end))
    except KeyError:
        raise HTTPException(404, "No such file in the code")


# ---- Finding things --------------------------------------------------------------

@app.get("/docs/v1/search")
def search(q: str = Query(min_length=2, max_length=100)):
    """Docs text, file paths, symbol names, routes and the comments in the code."""
    needle = q.lower()
    hits = []
    for path, f in scanner.files().items():
        if needle in path.lower():
            hits.append({"type": "file", "path": path, "title": path, "text": _summary(f.comment)})
        for s in f.symbols:
            hay = f"{s.name} {s.route} {s.comment}".lower()
            if needle in hay:
                hits.append({"type": "symbol", "path": path, "symbol": s.name, "kind": s.kind, "line": s.line,
                             "title": s.route or s.name, "text": _summary(s.comment)})
    docs = [{"type": e["kind"], "key": e["key"], "path": e["path"], "symbol": e["symbol"],
             "title": e["title"] or e["symbol"] or e["path"], "text": e["body"][:240]} for e in store.search(q)]
    return {"docs": docs, "code": hits[:200]}


@app.get("/docs/v1/routes")
def routes():
    """Every HTTP route and background job in the code: where to look for an endpoint."""
    files = scanner.files()
    docs = {e["key"]: e for e in store.all("sym")}
    out = []
    for path, f in sorted(files.items()):
        for s in f.symbols:
            if s.route:
                key = next((k for k, e in docs.items() if e["path"] == path and s.name in e["symbol"].split(",")), None)
                out.append({"route": s.route, "path": path, "symbol": s.name, "line": s.line,
                            "comment": _summary(s.comment), "doc_key": key})
    out.sort(key=lambda r: (r["route"].split(" ", 1)[-1], r["route"]))
    return {"routes": out}


@app.get("/docs/v1/status")
def status():
    """How complete the docs are, and the to-do list: files without a doc, stale and orphaned entries."""
    files = scanner.files()
    entries = store.all()
    documented = {e["path"] for e in entries if e["kind"] == "file"}
    stale, orphan = [], []
    for e in entries:
        state = _entry_state(e, files)
        item = {"key": e["key"], "path": e["path"], "symbol": e["symbol"], "updated_at": e["updated_at"],
                "updated_by": e["updated_by"]}
        if state == "stale":
            stale.append(item)
        elif state == "orphan":
            orphan.append(item)
    missing = [p for p in sorted(files) if p not in documented]
    return {"coverage": {"files": len(files), "files_documented": len(files) - len(missing),
                         "entries": len(entries), "stale": len(stale), "orphan": len(orphan)},
            "missing": missing, "stale": stale, "orphan": orphan}


# ---- History, import/export ------------------------------------------------------

@app.get("/docs/v1/history")
def history(key: str):
    return {"key": key, "revisions": store.history(key)}


@app.get("/docs/v1/recent")
def recent(limit: int = 50):
    return {"revisions": store.recent(max(1, min(limit, 200)))}


class RevertIn(BaseModel):
    id: int


@app.post("/docs/v1/revert")
def revert(body: RevertIn, author: str = Depends(writer)):
    r = store.revision(body.id)
    if r is None:
        raise HTTPException(404, "No such revision")
    old = store.get(r["key"]) or {}
    kind, _, rest = r["key"].partition(":")
    path, _, symbol = rest.partition("#") if kind == "sym" else (rest if kind == "file" else None, "", "")
    return {"entry": store.put(r["key"], kind=kind, title=r["title"], body=r["body"], author=author,
                               path=old.get("path") or path, symbol=old.get("symbol") or (symbol or None),
                               code_hash=r["code_hash"], note=f"reverted to revision {body.id}")}


@app.get("/docs/v1/export")
def export():
    """The live docs as the repo's Markdown files ({path under app/docs/content: text}). docs/pull.sh writes them."""
    return {"files": content.export_tree(store.all()), "exported_at": now()}


@app.post("/docs/v1/import")
def reimport(force: bool = False, _: str = Depends(writer)):
    """Read app/docs/content again (after a git pull): new entries in, newer repo copies replace live ones."""
    return import_content(force)


@app.get("/docs/v1/agents", response_class=PlainTextResponse)
def agents():
    """How an agent keeps these docs up to date (the same text as app/docs/README.md)."""
    readme = Path(SRC) / "docs" / "README.md"
    return readme.read_text(encoding="utf-8") if readme.exists() else "See app/docs/README.md"


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse({"message": exc.detail}, status_code=exc.status_code)
