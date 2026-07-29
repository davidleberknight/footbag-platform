#!/usr/bin/env python3
"""
patch_placements_v110_merge_premek.py

Placements-side companion to patch_pt_v71_merge_premek.py.

Reattributes the single placement row held by `Premek Pietrzycki`
(765859a9) to `Przemysław Pietrzycki` (8a15006e). The row is a solo
competitor entry, so only person_id and person_canon move; there is no team
key to split. The `norm` column keeps the spelling as it was recorded,
because that column is provenance of what the source said rather than a
display value.

The survivor's own rows in this file carry the pre-restoration spelling
`Przemyslaw Pietrzycki`, so the reattributed row takes that same value to
stay consistent with them. The restored spelling lives in the person truth
file, which is what the canonical export reads for display.

Expected diff:
  - 1 row mutated, 0 added, 0 deleted
  - zero rows still referencing the doomed person id afterwards
  - no other row touched

Input deviation from the older patch tools: every intermediate snapshot is
ignored by version control, so this reads the version-free file, which is
always a copy of the newest snapshot, and overwrites it in place. That file
is tracked, so a checkout of the one path is the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v110_merge_premek.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PB_IN = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"
PB_OUT = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v110.csv"
PB_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"

SURVIVOR_PID = "8a15006e-bc85-5621-bbe6-66090397b7d2"
DOOMED_PID = "765859a9-c027-51a9-b47c-0e8da93d568a"
SURVIVOR_CANON_IN_PLACEMENTS = "Przemyslaw Pietrzycki"
DOOMED_CANON = "Premek Pietrzycki"

EXPECTED_MOVED = 1


def main() -> None:
    if not PB_IN.exists():
        print(f"ERROR: {PB_IN} not found", file=sys.stderr)
        sys.exit(1)

    with open(PB_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        rows = list(reader)

    rows_before = len(rows)
    print(f"input rows: {rows_before}")

    before_snapshot = [tuple((k, r[k]) for k in fieldnames) for r in rows]

    doomed_rows = [r for r in rows if r["person_id"] == DOOMED_PID]
    if len(doomed_rows) != EXPECTED_MOVED:
        raise AssertionError(
            f"expected {EXPECTED_MOVED} doomed row(s), found {len(doomed_rows)}"
        )
    for r in doomed_rows:
        if r["competitor_type"] != "player":
            raise AssertionError(f"doomed row is not a solo entry: {r['competitor_type']!r}")
        if r["person_canon"] != DOOMED_CANON:
            raise AssertionError(f"doomed row canon is {r['person_canon']!r}")
    if any(DOOMED_PID in (r["team_person_key"] or "") for r in rows):
        raise AssertionError("doomed id appears inside a team key; split it explicitly")

    moved = 0
    for r in rows:
        if r["person_id"] == DOOMED_PID:
            r["person_id"] = SURVIVOR_PID
            r["person_canon"] = SURVIVOR_CANON_IN_PLACEMENTS
            moved += 1

    if moved != EXPECTED_MOVED:
        raise AssertionError(f"moved {moved} rows, expected {EXPECTED_MOVED}")
    if len(rows) != rows_before:
        raise AssertionError("row count changed")
    if any(r["person_id"] == DOOMED_PID for r in rows):
        raise AssertionError("a doomed reference survived")

    after_snapshot = [tuple((k, r[k]) for k in fieldnames) for r in rows]
    changed = sum(1 for a, b in zip(before_snapshot, after_snapshot) if a != b)
    if changed != EXPECTED_MOVED:
        raise AssertionError(f"{changed} rows changed, expected {EXPECTED_MOVED}")

    with open(PB_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    shutil.copyfile(PB_OUT, PB_VERSION_FREE)

    print(f"reattributed {moved} placement row to {SURVIVOR_PID[:8]}...")
    print(f"rows: {rows_before} (unchanged); wrote {PB_OUT.name} + version-free")


if __name__ == "__main__":
    main()
