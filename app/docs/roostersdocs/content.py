"""The docs as Markdown files in the repo (app/docs/content), and back.

    content/hub.md                           page:hub (the start page)
    content/guides/<slug>.md                 page:<slug>
    content/files/<path>.md                  file:<path> and its sym: entries

Pages start with front matter:

    ---
    title: Auth, sessions and guests
    position: 20
    updated: 2026-10-23T17:00:00Z
    ---

A file doc has the same front matter (only `updated`), then what the file is for, then one section per
function / class / route / table, or per group of them:

    ## `_sign_in`
    ## `ApiError`, `bad`, `not_found`

Other `##` headings (no backticks) are part of the file text. Import (store.import_tree) adds what's
missing and replaces an entry only when the file's `updated` is newer than the live entry, so edits made
live are never overwritten by an older repo copy; export writes the live state in the same format."""
import re
from pathlib import Path

SYMBOL_HEADING = re.compile(r"^## (`[^`]+`(?:\s*,\s*`[^`]+`)*)\s*$")


def _front(text: str) -> tuple[dict, str]:
    meta = {}
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            for line in text[4:end].splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
            text = text[end + 4:].lstrip("\n")
    return meta, text


def _meta(d: dict) -> str:
    lines = [f"{k}: {v}" for k, v in d.items() if v not in (None, "")]
    return "---\n" + "\n".join(lines) + "\n---\n\n"


def parse_file_doc(text: str) -> tuple[dict, str, list[tuple[str, str]]]:
    """-> (meta, file body, [(symbol or 'a,b', body), ...])"""
    meta, rest = _front(text)
    body_lines, sections, current, buf = [], [], None, []
    for line in rest.splitlines():
        m = SYMBOL_HEADING.match(line)
        if m:
            if current is None:
                body_lines = buf
            else:
                sections.append((current, "\n".join(buf).strip()))
            current = ",".join(x.strip().strip("`") for x in m.group(1).split(","))
            buf = []
        else:
            buf.append(line)
    if current is None:
        body_lines = buf
    else:
        sections.append((current, "\n".join(buf).strip()))
    return meta, "\n".join(body_lines).strip(), sections


def read_tree(root: Path) -> list[dict]:
    """Every entry the repo's content folder holds."""
    out = []
    if not root.is_dir():
        return out
    hub = root / "hub.md"
    pages = ([hub] if hub.exists() else []) + sorted((root / "guides").glob("*.md"))
    for p in pages:
        meta, body = _front(p.read_text(encoding="utf-8"))
        slug = "hub" if p == hub else p.stem
        out.append({"key": f"page:{slug}", "kind": "page", "title": meta.get("title", slug), "body": body.strip(),
                    "position": int(meta.get("position", 0 if slug == "hub" else 100)),
                    "updated": meta.get("updated", "")})
    files = root / "files"
    if files.is_dir():
        for p in sorted(files.rglob("*.md")):
            path = str(p.relative_to(files))[:-3]
            meta, body, sections = parse_file_doc(p.read_text(encoding="utf-8"))
            updated = meta.get("updated", "")
            if body:
                out.append({"key": f"file:{path}", "kind": "file", "path": path, "body": body, "updated": updated})
            for symbol, sbody in sections:
                if sbody:
                    out.append({"key": f"sym:{path}#{symbol}", "kind": "sym", "path": path, "symbol": symbol,
                                "body": sbody, "updated": updated})
    return out


def export_tree(entries: list[dict]) -> dict[str, str]:
    """{relative path under content/: Markdown}: the live docs in the repo format."""
    out: dict[str, str] = {}
    by_path: dict[str, dict] = {}
    for e in entries:
        if e["kind"] == "page":
            slug = e["key"][5:]
            name = "hub.md" if slug == "hub" else f"guides/{slug}.md"
            out[name] = _meta({"title": e["title"], "position": e["position"], "updated": e["updated_at"]}) + \
                e["body"].strip() + "\n"
        else:
            f = by_path.setdefault(e["path"], {"body": "", "syms": [], "updated": ""})
            f["updated"] = max(f["updated"], e["updated_at"])
            if e["kind"] == "file":
                f["body"] = e["body"].strip()
            else:
                f["syms"].append((e["symbol"], e["body"].strip()))
    for path, f in sorted(by_path.items()):
        parts = [_meta({"updated": f["updated"]}) + (f["body"] + "\n" if f["body"] else "")]
        for symbol, body in f["syms"]:
            names = ", ".join(f"`{s}`" for s in symbol.split(","))
            parts.append(f"\n## {names}\n\n{body}\n")
        out[f"files/{path}.md"] = "".join(parts)
    return out
