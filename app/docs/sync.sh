#!/usr/bin/env bash
# Live docs <-> the Markdown in app/docs/content (run on the laptop, from anywhere in the repo).
#
#   ./docs/sync.sh status   what's missing or stale (the to-do list)
#   ./docs/sync.sh pull     live docs -> app/docs/content (then commit, so the repo has a copy)
#   ./docs/sync.sh push     app/docs/content -> live docs (after a git pull; newer repo copies win)
#
# DOCS_URL (default http://127.0.0.1:8095) and DOCS_TOKEN (from app/.env) are read from the environment.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
url="${DOCS_URL:-http://127.0.0.1:8095}"
if [ -z "${DOCS_TOKEN:-}" ] && [ -f "$here/../.env" ]; then
  DOCS_TOKEN="$(grep -E '^DOCS_TOKEN=' "$here/../.env" | cut -d= -f2- || true)"
fi

case "${1:-status}" in
  status)
    curl -fsS "$url/docs/v1/status" | python3 -c '
import json, sys
s = json.load(sys.stdin); c = s["coverage"]
print("files {}/{} documented, {} stale, {} orphaned".format(c["files_documented"], c["files"], c["stale"], c["orphan"]))
for p in s["missing"]: print("  missing ", p)
for e in s["stale"]: print("  stale   ", e["key"])
for e in s["orphan"]: print("  orphan  ", e["key"])'
    ;;
  pull)
    curl -fsS "$url/docs/v1/export" | python3 -c '
import json, sys, pathlib
root = pathlib.Path(sys.argv[1])
files = json.load(sys.stdin)["files"]
for rel, text in files.items():
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
print(f"wrote {len(files)} files to {root}")' "$here/content"
    ;;
  push)
    curl -fsS -X POST -H "Authorization: Bearer ${DOCS_TOKEN:?set DOCS_TOKEN}" -H "X-Docs-Author: repo" \
      "$url/docs/v1/import${2:+?force=true}"; echo
    ;;
  *) echo "usage: $0 status|pull|push [force]" >&2; exit 2 ;;
esac
