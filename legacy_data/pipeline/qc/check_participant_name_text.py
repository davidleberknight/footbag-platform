#!/usr/bin/env python3
"""
QC: a person name in the canonical output is only a name.

A result list on the legacy site can decorate a name with a medal: an emoji, or a
word such as "Gold:". A name that keeps the decoration, a control character or a
stray space misses the alias lookup, so the seed build mints a separate person for
it and the player's results split across two history pages. Nothing later notices,
because the extra person looks like any other unresolved name.

The export strips the decorations it knows. This check fails on whatever gets past
it: a symbol glyph, a control character, a medal prefix or untrimmed whitespace in
a participant's display name or a person's name. Accents, apostrophes and hyphens
are ordinary name text and pass.

## Exit codes

    0  PASS — no name carries any of these
    1  FAIL — the offending names are listed
    2  ERROR — a canonical file is missing or lacks its name column
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
from pathlib import Path

LEGACY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CANONICAL = LEGACY_ROOT / "event_results" / "canonical_input"
SOURCES = (("event_result_participants.csv", "display_name"), ("persons.csv", "person_name"))
_MEDAL_PREFIX_RE = re.compile(r"^(?:Gold|Silver|Bronze)\s*:", re.IGNORECASE)
_BANNED_CATEGORIES = {"So": "a symbol glyph", "Cc": "a control character"}


def name_problem(name: str) -> str | None:
    """What is wrong with this name, or None when it is only a name."""
    if name != name.strip():
        return "untrimmed whitespace"
    if _MEDAL_PREFIX_RE.match(name):
        return "a medal prefix"
    for ch in name:
        problem = _BANNED_CATEGORIES.get(unicodedata.category(ch))
        if problem:
            return problem
    return None


def find_problems(path: Path, column: str) -> dict[tuple[str, str], int]:
    """Each distinct (name, problem) in one file, with how many rows carry it."""
    found: dict[tuple[str, str], int] = {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if column not in (reader.fieldnames or []):
            raise KeyError(column)
        for row in reader:
            name = row[column] or ""
            problem = name_problem(name)
            if problem:
                found[(name, problem)] = found.get((name, problem), 0) + 1
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--canonical-dir", type=Path, default=DEFAULT_CANONICAL)
    args = parser.parse_args()

    print("=== participant name text ===")
    total = 0
    for filename, column in SOURCES:
        path = args.canonical_dir / filename
        try:
            found = find_problems(path, column)
        except FileNotFoundError:
            print(f"ERROR: {path} not found. pipeline/platform/export_canonical_platform.py "
                  "writes it; ./run_pipeline.sh full runs the export.")
            return 2
        except KeyError:
            print(f"ERROR: {path} has no {column} column.")
            return 2
        for (name, problem), count in sorted(found.items()):
            print(f"  {filename}: {name!r} carries {problem} (x{count})")
            total += count
    if total:
        print(f"STATUS: FAIL — {total} row(s) carry a decorated name")
        print("Fix the source of the decoration or the export's name cleaning; do not edit the output.")
        return 1
    print("STATUS: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
