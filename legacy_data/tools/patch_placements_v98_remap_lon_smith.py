#!/usr/bin/env python3
"""
patch_placements_v98_remap_lon_smith.py

Companion to patch_pt_v54_consolidate_lon_smith.py. Advances
Placements_ByPerson from v97 to v98 by remapping every reference to
60860e34-935d-5bb0-b718-a430fa4a142e (Lon Smith) onto
11d216c3-891d-5728-981f-dc20ba381dd9 (Skyler Lon Smith).

Rewrites:
  - col person_id          (solo rows)
  - col team_person_key    (pipe-separated, team rows)
  - col person_canon       (display name for remapped solo rows only)
  - col norm               (normalized display key for remapped solo rows)

Leaves all other columns untouched.

Expected v97 → v98 diff:
  - 32 solo rows with person_id=60860e34 remapped
  - 1 team row with team_person_key=60860e34|... rewritten (Skyler | partner)
  - total row count unchanged (27,971)
  - post-run `grep 60860e34` in v98 must return 0; asserted before write.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v98_remap_lon_smith.py
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # legacy_data/
PB_V97 = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v97.csv"
PB_V98 = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v98.csv"

DOOMED_PID   = "60860e34-935d-5bb0-b718-a430fa4a142e"  # Lon Smith
SURVIVOR_PID = "11d216c3-891d-5728-981f-dc20ba381dd9"  # Skyler Lon Smith
SURVIVOR_DISPLAY = "Skyler Lon Smith"
SURVIVOR_NORM    = "skyler lon smith"


def _remap_team_key(team_key: str) -> str:
    """Split on `|`, replace doomed pid with survivor pid, collapse any
    duplicate of survivor that may already be in the key, preserve order.
    """
    parts = [p.strip() for p in team_key.split("|") if p.strip()]
    seen = set()
    out: list[str] = []
    for p in parts:
        new = SURVIVOR_PID if p == DOOMED_PID else p
        if new in seen:
            continue
        seen.add(new)
        out.append(new)
    return "|".join(out)


def main() -> None:
    if not PB_V97.exists():
        print(f"ERROR: {PB_V97} not found", file=sys.stderr)
        sys.exit(1)

    with open(PB_V97, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None, "Placements v97 header missing"
        rows = list(reader)

    solo_hits = 0
    team_hits = 0
    out_rows: list[dict[str, str]] = []
    for row in rows:
        pid = row.get("person_id", "") or ""
        tkey = row.get("team_person_key", "") or ""

        solo_match = (pid == DOOMED_PID)
        team_match = (DOOMED_PID in tkey)

        if solo_match:
            row = dict(row)
            row["person_id"] = SURVIVOR_PID
            row["person_canon"] = SURVIVOR_DISPLAY
            if "norm" in fieldnames:
                row["norm"] = SURVIVOR_NORM
            solo_hits += 1

        if team_match:
            row = dict(row)
            row["team_person_key"] = _remap_team_key(tkey)
            team_hits += 1

        out_rows.append(row)

    # Safety: no doomed id may appear anywhere in the output.
    offenders = []
    for i, row in enumerate(out_rows):
        for k, v in row.items():
            if v and DOOMED_PID in v:
                offenders.append((i, k, v))
    if offenders:
        print(f"ERROR: {len(offenders)} residual refs to {DOOMED_PID}:", file=sys.stderr)
        for o in offenders[:5]:
            print(f"  row {o[0]} col {o[1]}: {o[2]}", file=sys.stderr)
        sys.exit(3)

    assert len(out_rows) == len(rows), (
        f"row count drift: {len(rows)} → {len(out_rows)}"
    )

    with open(PB_V98, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(out_rows)

    survivor_total = sum(
        1 for r in out_rows
        if r.get("person_id") == SURVIVOR_PID
        or SURVIVOR_PID in (r.get("team_person_key") or "")
    )

    print(f"Placements v97 rows: {len(rows)}")
    print(f"Placements v98 rows: {len(out_rows)}  (delta: 0)")
    print(f"  solo person_id remapped:        {solo_hits}")
    print(f"  team team_person_key remapped:  {team_hits}")
    print(f"  rows referencing survivor pid:  {survivor_total}")
    print(f"Output: {PB_V98}")


if __name__ == "__main__":
    main()
