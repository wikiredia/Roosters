"""The docs service against a small fake code tree (written once per test session)."""
import os
import tempfile
from pathlib import Path

ROOT = Path(tempfile.mkdtemp(prefix="docs-test-"))
SRC = ROOT / "src"
(SRC / "api" / "roosters").mkdir(parents=True)
(SRC / "mobile" / "src" / "lib").mkdir(parents=True)
(SRC / "docs" / "content" / "files" / "api" / "roosters").mkdir(parents=True)
(SRC / "docs" / "content" / "guides").mkdir(parents=True)
(SRC / "api" / "roosters" / "r_me.py").write_text('''"""Your own account."""
from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/me")
MAX_SOURCES = 8


@router.get("")
def me():
    """Who am I."""
    return {}


def helper(x: int) -> int:
    return x


class Thing:
    """A thing."""

    def go(self):
        pass
''')
(SRC / "mobile" / "src" / "lib" / "time.ts").write_text('''/** Dates and times. */

/** Monday of the week */
export function monday(d: Date) {
  return d;
}

export const DAY = 86400;

export function useClock() {
  return 1;
}
''')
(SRC / "docs" / "content" / "hub.md").write_text("---\ntitle: Roosters+\nposition: 0\nupdated: 2026-01-01T00:00:00Z\n---\n\n# Hub\n\nStart here.\n")
(SRC / "docs" / "content" / "guides" / "auth.md").write_text("---\ntitle: Auth\nposition: 20\nupdated: 2026-01-01T00:00:00Z\n---\n\nHow sign-in works.\n")
(SRC / "docs" / "content" / "files" / "api" / "roosters" / "r_me.py.md").write_text(
    "---\nupdated: 2026-01-01T00:00:00Z\n---\n\nThe /me routes.\n\n## Not a symbol\n\nStill file text.\n\n"
    "## `me`\n\nReturns you.\n\n## `helper`, `MAX_SOURCES`\n\nA group.\n")

os.environ["DOCS_SRC"] = str(SRC)
os.environ["DOCS_DB"] = str(ROOT / "docs.sqlite")
os.environ["DOCS_TOKEN"] = "test-docs-token-that-is-long-enough-0123456789"
