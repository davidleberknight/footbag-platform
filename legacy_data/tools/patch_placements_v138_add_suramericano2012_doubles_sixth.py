#!/usr/bin/env python3
"""
patch_placements_v138_add_suramericano2012_doubles_sixth.py

Restores 6th place of Open Doubles Net at the 6th Suramericano de Footbag 2012
(event 1346947092) in the frozen placements lock.

The page lists seven places under "OPEN NET DOBLES", each a pair joined by the
Spanish "Y" (and). The 6th line is written without a space after the ordinal,
"6°lugar EDWIN JARAMILLO Y STIVEN ZAMORA", and the lock has no row for it, so the
division jumps from 5th to 7th.

The division's other places are placeholder rows that the team-correction list
splits into their two players. This patch adds the same placeholder row at 6th,
after the 5th-place row, and the team-correction list names its players. Every
other line is copied through byte for byte. A second run stops on its
pre-condition check; checking out the file is the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v138_add_suramericano2012_doubles_sixth.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PBP = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"

PREFIX = "1346947092,2012,Open Doubles Net,net,"
SUFFIX = ",player,,,__NON_PERSON__,,mostly_complete,,__non_person__,"
AFTER_LINE = PREFIX + "5" + SUFFIX
NEW_LINE = PREFIX + "6" + SUFFIX


def main() -> None:
    if not PBP.exists():
        print(f"ERROR: {PBP} not found", file=sys.stderr)
        sys.exit(1)
    raw = PBP.read_bytes().decode("utf-8")
    if "\r\n" in raw:
        raise AssertionError(f"{PBP.name}: expected LF line endings")
    lines = raw.split("\n")
    if NEW_LINE in lines:
        raise AssertionError("6th-place row already present (already applied?)")
    division = [ln for ln in lines if ln.startswith(PREFIX)]
    if len(division) != 6:
        raise AssertionError(f"expected the division's 6 rows, found {len(division)}")
    hits = [i for i, ln in enumerate(lines) if ln == AFTER_LINE]
    if len(hits) != 1:
        raise AssertionError(f"expected the one 5th-place row, found {len(hits)}")
    lines.insert(hits[0] + 1, NEW_LINE)
    PBP.write_text("\n".join(lines), encoding="utf-8")
    print(f"{PBP.relative_to(ROOT)}: event 1346947092 Open Doubles Net: 6th-place row added")


if __name__ == "__main__":
    main()
