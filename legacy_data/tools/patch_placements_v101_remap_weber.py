#!/usr/bin/env python3
"""
patch_placements_v101_remap_weber.py

Companion to patch_pt_v57_consolidate_weber.py. Advances
Placements_ByPerson from v100 to v101 by remapping every reference to
0c03e968-f8b4-58fa-94d9-7c5094645d7a (Honza Weber) onto
1e09ba09-ec4b-5961-8b95-e0d638dc4f5c (Jan Weber).

Expected v100 → v101 diff (pre-verified against v100):
  - 44 solo rows remapped (18 distinct events, 2002-2023)
  - 5 team rows remapped (team_person_key: 0c03e968|... → 1e09ba09|...)
  - 0 composite keys with BOTH doomed and surv (no intra-key collapse)
  - 4 events where both pids appear, but NO (event, discipline, placement,
    competitor_type) collision — all rows remap independently
  - total row count unchanged (27,970)
  - post-run `grep 0c03e968` in v101 must return 0

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v101_remap_weber.py
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PB_IN  = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v100.csv"
PB_OUT = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v101.csv"

DOOMED_PID   = "0c03e968-f8b4-58fa-94d9-7c5094645d7a"
SURVIVOR_PID = "1e09ba09-ec4b-5961-8b95-e0d638dc4f5c"
SURVIVOR_DISPLAY = "Jan Weber"
SURVIVOR_NORM    = "jan weber"


def _remap_team_key(team_key: str) -> str:
    parts = [p.strip() for p in team_key.split("|") if p.strip()]
    seen = set(); out = []
    for p in parts:
        new = SURVIVOR_PID if p == DOOMED_PID else p
        if new in seen: continue
        seen.add(new); out.append(new)
    return "|".join(out)


def main() -> None:
    if not PB_IN.exists():
        print(f"ERROR: {PB_IN} not found", file=sys.stderr); sys.exit(1)

    with open(PB_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f); fieldnames = reader.fieldnames; rows = list(reader)

    solo = team = 0
    out_rows = []
    for row in rows:
        pid = row.get("person_id", "") or ""
        tkey = row.get("team_person_key", "") or ""
        if pid == DOOMED_PID:
            row = dict(row)
            row["person_id"] = SURVIVOR_PID
            row["person_canon"] = SURVIVOR_DISPLAY
            if "norm" in fieldnames:
                row["norm"] = SURVIVOR_NORM
            solo += 1
        if DOOMED_PID in tkey:
            row = dict(row)
            row["team_person_key"] = _remap_team_key(tkey)
            team += 1
        out_rows.append(row)

    offenders = [(i, k, v) for i, r in enumerate(out_rows) for k, v in r.items() if v and DOOMED_PID in v]
    if offenders:
        print(f"ERROR: {len(offenders)} residual DOOMED refs", file=sys.stderr)
        for o in offenders[:5]: print(f"  row {o[0]} col {o[1]}: {o[2]}", file=sys.stderr)
        sys.exit(3)
    assert len(out_rows) == len(rows)

    with open(PB_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames); w.writeheader(); w.writerows(out_rows)

    survivor_total = sum(
        1 for r in out_rows
        if r.get("person_id") == SURVIVOR_PID or SURVIVOR_PID in (r.get("team_person_key") or "")
    )
    print(f"v100 rows: {len(rows)}  v101 rows: {len(out_rows)}  delta: 0")
    print(f"  solo remapped: {solo}  team remapped: {team}")
    print(f"  rows referencing survivor: {survivor_total}")
    print(f"Output: {PB_OUT}")


if __name__ == "__main__":
    main()
