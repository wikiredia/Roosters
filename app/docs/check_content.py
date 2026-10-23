"""CI check: every doc in app/docs/content points at a file and symbols that exist in the code.

    python docs/check_content.py      (from app/)

Exits 1 and lists the problems (a renamed function whose doc heading wasn't updated, a deleted file, a typo).
Files without a doc are listed as a warning only: the live service's To-do list tracks those."""
import sys
from pathlib import Path

from roostersdocs import content, scan

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    files = scan.Scanner(str(ROOT)).files()
    problems, documented = [], set()
    for e in content.read_tree(ROOT / "docs" / "content"):
        if e["kind"] == "page":
            continue
        f = files.get(e["path"])
        if f is None:
            problems.append(f"{e['key']}: no such file in the code")
            continue
        documented.add(e["path"])
        if e["kind"] == "sym":
            names = {s.name for s in f.symbols}
            missing = [n for n in e["symbol"].split(",") if n not in names]
            if missing:
                problems.append(f"{e['key']}: unknown symbol(s) {', '.join(missing)}")
    for p in sorted(set(files) - documented):
        print(f"warning: no doc for {p}")
    for p in problems:
        print(f"error: {p}")
    print(f"{len(documented)}/{len(files)} files documented, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
