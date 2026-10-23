"""Reads the deployed code (read-only mount, DOCS_SRC) and lists every file with its symbols.

The texts people and agents write live in the database (store.py); this module only says what exists
in the code right now and what each part looks like, so the docs can show the tree, the functions, the
routes and the comments in the code itself, and flag a doc whose code changed since it was written
(a hash per file and per symbol).

Per language:
- Python (ast): functions, classes with their methods, FastAPI routes (@router.get("/x")), docstrings
- TypeScript/TSX (regex): exported functions/components/consts/types, top-level functions, /** comments */
- SQL: CREATE TABLE with the comment lines above it
- YAML (compose, workflows): services / jobs
- Everything else: file only"""
import ast
import hashlib
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path

# What counts as source. Paths are relative to DOCS_SRC (the app/ folder of the repo).
INCLUDE = (".py", ".ts", ".tsx", ".sql", ".yml", ".yaml", ".json", ".sh", ".toml", ".txt", ".md", ".css", ".js")
SKIP_DIRS = {"node_modules", ".expo", "dist", "build", "__pycache__", ".git", ".pytest_cache", ".ruff_cache",
             "web-build", "ios", "android", "claude-design", ".venv", "venv"}
SKIP_FILES = {"package-lock.json", "uniwind-types.d.ts"}
# The docs' own Markdown content and the design prompt are not code
SKIP_PATHS = ("docs/content", "design")
MAX_FILE = 512 * 1024


@dataclass
class Symbol:
    name: str
    kind: str            # function, class, method, route, component, hook, const, type, table, service
    line: int
    end: int
    signature: str = ""
    comment: str = ""    # docstring / JSDoc / SQL comment from the code itself
    route: str = ""      # "GET /api/v1/me" for FastAPI routes
    hash: str = ""
    parent: str = ""     # class name for methods


@dataclass
class File:
    path: str
    lang: str
    lines: int
    hash: str
    comment: str = ""    # module docstring / header comment
    symbols: list[Symbol] = field(default_factory=list)


def _h(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()[:16]


def _lang(path: str) -> str:
    ext = Path(path).suffix.lower()
    return {".py": "python", ".ts": "typescript", ".tsx": "tsx", ".sql": "sql", ".yml": "yaml", ".yaml": "yaml",
            ".json": "json", ".sh": "shell", ".toml": "toml", ".md": "markdown", ".css": "css", ".js": "javascript",
            ".txt": "text"}.get(ext, "text")


# ---- Python ----------------------------------------------------------------------

ROUTE_METHODS = {"get", "post", "put", "patch", "delete"}


def _prefixes(tree: ast.Module) -> dict[str, str]:
    """router = APIRouter(prefix="/api/v1/me") -> {"router": "/api/v1/me"}"""
    out = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            fn = node.value.func
            name = fn.id if isinstance(fn, ast.Name) else fn.attr if isinstance(fn, ast.Attribute) else ""
            if name in ("APIRouter", "FastAPI"):
                prefix = ""
                for kw in node.value.keywords:
                    if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
                        prefix = str(kw.value.value)
                for t in node.targets:
                    if isinstance(t, ast.Name):
                        out[t.id] = prefix
    return out


def _route(fn: ast.AST, prefixes: dict[str, str]) -> str:
    for d in getattr(fn, "decorator_list", []):
        if isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr in ROUTE_METHODS:
            owner = d.func.value.id if isinstance(d.func.value, ast.Name) else ""
            path = d.args[0].value if d.args and isinstance(d.args[0], ast.Constant) else ""
            return f"{d.func.attr.upper()} {prefixes.get(owner, '')}{path}"
        if isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr == "handler":
            arg = d.args[0].value if d.args and isinstance(d.args[0], ast.Constant) else ""
            return f"JOB {arg}"
    return ""


def _signature(fn: ast.AST) -> str:
    try:
        args = ast.unparse(fn.args)
    except Exception:  # noqa: BLE001
        args = "…"
    ret = f" -> {ast.unparse(fn.returns)}" if getattr(fn, "returns", None) is not None else ""
    prefix = "async def" if isinstance(fn, ast.AsyncFunctionDef) else "def"
    return f"{prefix} {fn.name}({args}){ret}"


def _python(text: str) -> tuple[str, list[Symbol]]:
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return "", []
    lines = text.splitlines()
    seg = lambda n: "\n".join(lines[n.lineno - 1:n.end_lineno])  # noqa: E731
    prefixes = _prefixes(tree)
    out: list[Symbol] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            route = _route(node, prefixes)
            out.append(Symbol(node.name, "route" if route.split(" ")[0] in {m.upper() for m in ROUTE_METHODS}
                              else "job" if route.startswith("JOB") else "function",
                              node.lineno, node.end_lineno, _signature(node), ast.get_docstring(node) or "", route,
                              _h(seg(node))))
        elif isinstance(node, ast.ClassDef):
            bases = ", ".join(ast.unparse(b) for b in node.bases)
            out.append(Symbol(node.name, "class", node.lineno, node.end_lineno, f"class {node.name}({bases})",
                              ast.get_docstring(node) or "", "", _h(seg(node))))
            for sub in node.body:
                if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    out.append(Symbol(f"{node.name}.{sub.name}", "method", sub.lineno, sub.end_lineno, _signature(sub),
                                      ast.get_docstring(sub) or "", "", _h(seg(sub)), node.name))
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            # Module-level UPPERCASE names: settings, limits, tables of texts (any length)
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            names = [n for t in targets for n in (t.elts if isinstance(t, ast.Tuple) else [t])]
            for t in names:
                if isinstance(t, ast.Name) and t.id.isupper():
                    out.append(Symbol(t.id, "const", node.lineno, node.end_lineno, seg(node).splitlines()[0].strip()[:160],
                                      "", "", _h(seg(node))))
    return ast.get_docstring(tree) or "", out


# ---- TypeScript ------------------------------------------------------------------

TS_DECL = re.compile(
    r"^(export\s+)?(default\s+)?(async\s+)?(function\s+(?P<fn>[A-Za-z0-9_]+)|const\s+(?P<const>[A-Za-z0-9_]+)\s*[:=]"
    r"|(type|interface)\s+(?P<type>[A-Za-z0-9_]+)|class\s+(?P<cls>[A-Za-z0-9_]+))")


def _jsdoc_before(lines: list[str], i: int) -> str:
    """The /** ... */ or // comment block right above line i (0-based)."""
    j = i - 1
    if j >= 0 and lines[j].strip().endswith("*/"):
        block = []
        while j >= 0:
            block.insert(0, lines[j])
            if lines[j].strip().startswith("/**") or lines[j].strip().startswith("/*"):
                break
            j -= 1
        text = "\n".join(block)
        text = re.sub(r"^\s*/\*\*?|\*/\s*$", "", text.strip())
        return "\n".join(re.sub(r"^\s*\* ?", "", ln) for ln in text.splitlines()).strip()
    block = []
    while j >= 0 and lines[j].strip().startswith("//"):
        block.insert(0, lines[j].strip()[2:].strip())
        j -= 1
    return "\n".join(block)


def _typescript(text: str, path: str) -> tuple[str, list[Symbol]]:
    lines = text.splitlines()
    found = []
    for i, line in enumerate(lines):
        m = TS_DECL.match(line)
        if not m:
            continue
        exported = bool(m.group(1))
        name = m.group("fn") or m.group("const") or m.group("type") or m.group("cls")
        if m.group("const") and not exported and not (name.isupper() and line[:1] not in " \t"):
            continue  # local constants are noise, except module-level UPPERCASE ones (limits, tables)
        if m.group("fn"):
            kind = "hook" if name.startswith("use") else "component" if name[0].isupper() else "function"
        elif m.group("type"):
            kind = "type"
        elif m.group("cls"):
            kind = "class"
        else:
            kind = "const"
        if m.group(2) and path.startswith("mobile/src/app/"):
            kind = "screen"
        found.append((i, name, kind, line.strip().rstrip("{").strip()[:200]))
    out = []
    for n, (i, name, kind, sig) in enumerate(found):
        end = (found[n + 1][0] if n + 1 < len(found) else len(lines))
        # Trim trailing blank lines/comments of the next symbol
        while end - 1 > i and (not lines[end - 1].strip() or lines[end - 1].strip().startswith(("/*", "*", "//"))):
            end -= 1
        out.append(Symbol(name, kind, i + 1, end, sig, _jsdoc_before(lines, i), "", _h("\n".join(lines[i:end]))))
    return _ts_header(lines, {i for i, *_ in found}), out


def _ts_header(lines: list[str], symbol_lines: set[int]) -> str:
    """The first /** ... */ block of the file, unless it's the JSDoc of a symbol (the next line declares one)."""
    first = min(symbol_lines) if symbol_lines else len(lines)
    for i, ln in enumerate(lines[:first]):
        if not ln.strip().startswith("/**"):
            continue
        j = i
        while j < len(lines) and "*/" not in lines[j]:
            j += 1
        k = j + 1
        while k < len(lines) and not lines[k].strip():
            k += 1
        if k in symbol_lines:
            return ""
        text = "\n".join(lines[i:j + 1]).strip()
        text = re.sub(r"^/\*\*|\*/$", "", text).strip()
        return "\n".join(re.sub(r"^\s*\* ?", "", x) for x in text.splitlines()).strip()
    return ""


# ---- SQL / YAML ------------------------------------------------------------------

def _sql(text: str) -> tuple[str, list[Symbol]]:
    lines = text.splitlines()
    out = []
    header = []
    for ln in lines:
        if ln.startswith("--"):
            header.append(ln[2:].strip())
        else:
            break
    for i, ln in enumerate(lines):
        m = re.match(r"\s*(CREATE TABLE(?: IF NOT EXISTS)?|ALTER TABLE)\s+`?([a-z_0-9]+)`?", ln, re.I)
        if not m:
            continue
        j, comment = i - 1, []
        while j >= 0 and lines[j].startswith("--"):
            comment.insert(0, lines[j][2:].strip())
            j -= 1
        end = i
        while end < len(lines) and ";" not in lines[end]:
            end += 1
        kind = "table" if m.group(1).upper().startswith("CREATE") else "alter"
        name = m.group(2) if kind == "table" else f"{m.group(2)} (alter at line {i + 1})"
        out.append(Symbol(name, kind, i + 1, end + 1, ln.strip()[:160], "\n".join(comment), "",
                          _h("\n".join(lines[i:end + 1]))))
    return "\n".join(header), out


def _yaml(text: str) -> tuple[str, list[Symbol]]:
    lines = text.splitlines()
    out, section = [], None
    header = []
    for ln in lines:
        if ln.startswith("#"):
            header.append(ln[1:].strip())
        elif ln.strip():
            break
    for i, ln in enumerate(lines):
        if re.match(r"^(services|jobs):\s*$", ln):
            section = ln.split(":")[0]
            continue
        if re.match(r"^\S", ln):
            section = None if not ln.startswith(("services", "jobs")) else section
        m = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", ln)
        if section and m:
            j, comment = i - 1, []
            while j >= 0 and lines[j].strip().startswith("#"):
                comment.insert(0, lines[j].strip()[1:].strip())
                j -= 1
            end = i + 1
            while end < len(lines) and (not lines[end].strip() or lines[end].startswith("   ") or
                                        lines[end].strip().startswith("#")):
                end += 1
            # The comment above the next service belongs to that one
            while end - 1 > i and (not lines[end - 1].strip() or lines[end - 1].strip().startswith("#")):
                end -= 1
            out.append(Symbol(m.group(1), "service" if section == "services" else "job", i + 1, end, ln.strip(),
                              "\n".join(comment), "", _h("\n".join(lines[i:end]))))
    return "\n".join(header), out


# ---- The whole tree --------------------------------------------------------------

def scan_file(root: Path, rel: str) -> File | None:
    p = root / rel
    try:
        if p.stat().st_size > MAX_FILE:
            return None
        text = p.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    lang = _lang(rel)
    header, symbols = "", []
    if lang == "python":
        header, symbols = _python(text)
    elif lang in ("typescript", "tsx", "javascript"):
        header, symbols = _typescript(text, rel)
    elif lang == "sql":
        header, symbols = _sql(text)
    elif lang == "yaml":
        header, symbols = _yaml(text)
    return File(rel, lang, text.count("\n") + 1, _h(text), header, symbols)


def walk(root: Path) -> list[str]:
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = str(Path(dirpath).relative_to(root))
        if rel_dir != "." and rel_dir.startswith(SKIP_PATHS):
            dirnames[:] = []
            continue
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith("."))
        for f in sorted(filenames):
            if f in SKIP_FILES or f.startswith(".") and f not in (".env.example",):
                continue
            if f.endswith(INCLUDE) or f in ("Dockerfile", ".env.example"):
                out.append(str((Path(dirpath) / f).relative_to(root)))
    return sorted(out)


class Scanner:
    """Keeps the last scan; rescans a file only when its mtime or size changed (cheap enough per request)."""

    def __init__(self, root: str, ttl: float = 3.0):
        self.root = Path(root)
        self.ttl = ttl
        self._files: dict[str, File] = {}
        self._stat: dict[str, tuple[float, int]] = {}
        self._at = 0.0

    def files(self) -> dict[str, File]:
        if time.time() - self._at < self.ttl:
            return self._files
        current = {}
        for rel in walk(self.root):
            try:
                st = (self.root / rel).stat()
            except OSError:
                continue
            key = (st.st_mtime, st.st_size)
            if self._stat.get(rel) == key and rel in self._files:
                current[rel] = self._files[rel]
                continue
            f = scan_file(self.root, rel)
            if f:
                current[rel] = f
                self._stat[rel] = key
        self._files = current
        self._at = time.time()
        return current

    def source(self, rel: str, start: int = 1, end: int | None = None) -> str:
        """A slice of a file, for the console's 'show code' (only files the scan knows: no path tricks)."""
        if rel not in self.files():
            raise KeyError(rel)
        lines = (self.root / rel).read_text(encoding="utf-8").splitlines()
        end = min(end or len(lines), len(lines), start + 800)
        return "\n".join(lines[max(1, start) - 1:end])
