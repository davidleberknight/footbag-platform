#!/usr/bin/env python3
"""
append_team_corrections.py

Append reviewed correction rows to inputs/team_corrections.csv, byte for byte.

team_corrections.csv is hand-curated. A batch too large to add by hand in an
editor (the tied singles placings, one row per placing, each quoting its source
lines) is prepared as a file of CSV rows and appended with this tool, which
copies the lines exactly rather than round-tripping the curated file through a
CSV reader and writer.

Before writing anything it checks every row to be added:
  - it parses to exactly the curated file's columns;
  - its correction_type is one the remediation pass applies;
  - it is active and names an event, a discipline and a placement;
  - no row already in the file, and no other new row, has the same event,
    discipline, placement and correction type, so a second run adds nothing
    and stops instead.
The curated file must use LF line endings and end with a newline. Checking out
the file is the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/append_team_corrections.py <rows.csv>
"""

from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "inputs" / "team_corrections.csv"
TYPES = {"DUPLICATE_PARTICIPANT", "MISSING_PARTNER", "PHANTOM_ROW",
         "SPLIT_PARSING_ERROR", "TIED_TEAM", "TIED_SINGLES"}


def _key(r: dict) -> tuple[str, str, str, str]:
    return (r["event_key"].strip(), r["discipline_key"].strip(),
            r["placement"].strip(), r["correction_type"].strip())


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: append_team_corrections.py <rows.csv>")
    src = Path(sys.argv[1])
    raw = TARGET.read_bytes().decode("utf-8")
    if "\r\n" in raw or not raw.endswith("\n"):
        sys.exit(f"ERROR: {TARGET.name} must use LF line endings and end with a newline")
    header = next(csv.reader([raw.split("\n", 1)[0]]))
    existing = {_key(r) for r in csv.DictReader(io.StringIO(raw))}

    new_text = src.read_bytes().decode("utf-8")
    if "\r\n" in new_text or not new_text.endswith("\n"):
        sys.exit(f"ERROR: {src} must use LF line endings and end with a newline")
    problems: list[str] = []
    seen: set = set()
    rows = list(csv.reader(io.StringIO(new_text)))
    for n, fields in enumerate(rows, start=1):
        if len(fields) != len(header):
            problems.append(f"row {n}: {len(fields)} fields, expected {len(header)}")
            continue
        r = dict(zip(header, fields))
        k = _key(r)
        if r["correction_type"].strip() not in TYPES:
            problems.append(f"row {n}: unknown correction_type {r['correction_type']!r}")
        if r["active"].strip() != "1" or not all(k[:3]):
            problems.append(f"row {n}: not active, or missing event, discipline or placement")
        if k in existing:
            problems.append(f"row {n}: {k} is already in {TARGET.name}")
        if k in seen:
            problems.append(f"row {n}: {k} appears twice in {src.name}")
        seen.add(k)
    if problems:
        sys.exit("ERROR: nothing appended.\n  " + "\n  ".join(problems[:20]))

    TARGET.write_text(raw + new_text, encoding="utf-8")
    print(f"{TARGET.relative_to(ROOT)}: {len(rows)} row(s) appended")


if __name__ == "__main__":
    main()
