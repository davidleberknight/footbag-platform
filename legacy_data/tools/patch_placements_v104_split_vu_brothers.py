#!/usr/bin/env python3
"""
patch_placements_v104_split_vu_brothers.py

Companion to patch_pt_v63_split_vu_brothers.py (PT-side identity split).
Phase 2 of the Vu-brothers fix:

  Phase 1 (v63 + person_aliases.csv): retargeted the 'Tu Vu' alias from
                                      Tuan's pid to Tu's pid; removed
                                      'Tu Vu' from Tuan's PT aliases_presentable.

  Phase 2 (this patch):               moves the single high-confidence
                                      placement currently mis-attributed
                                      to Tuan that originated from a
                                      'Tu Vu' raw name (Western Regional
                                      1999, Open Singles Freestyle, place 8).
                                      Also corrects 6 stale person_canon
                                      values on rows already correctly
                                      pointing at Tu's pid but tagged
                                      with 'Tuan Vu' display value.

  Phase 3 (deferred):                 5 'Tu Vu (US)' / 'Tu Vu (USA)' /
                                      'Tu Vu (SF Bay Area)' / 'Tu Vu
                                      (San Francisco,CA -USA)' / 'Tu Vu
                                      (U.S.A.)' player_ids in stage2 are
                                      currently merged into Tuan's PT
                                      row's player_ids_seen list. Their
                                      placements present with norm='tuan
                                      vu' (not 'tu vu') in the placements
                                      lock, so per the Phase-2 safety
                                      contract ('original source name
                                      explicitly supports Tu') they cannot
                                      be moved automatically. Phase 3 will
                                      use per-event mirror inspection to
                                      reattribute them.

Constraints honored (per user direction 2026-05-04):
  - Explicit EXPECTED_MOVES = {(910551956, 8)} allowlist
  - Match by (event_id, place); assert norm=='tu vu' inside the move
    block for safety; abort on any drift
  - Person_canon cleanup for already-Tu-pid rows is a separate block
    keyed by (person_id == TU_PID) AND (person_canon == 'Tuan Vu')
  - No team_person_key reassignment (the row is solo)
  - No edits to other rows; total row count unchanged

Expected v103 → v104 diff (pre-verified):
  - 1 person_id remap on (910551956, 8, 'Open Singles Freestyle')
  - 7 person_canon updates ('Tuan Vu' → 'Tu Vu') across the 1 moved row
    plus the 6 existing Tu-pid rows
  - total row count unchanged (27,970)
  - post-run no rows where person_id == TU_PID and person_canon == 'Tuan Vu'

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v104_split_vu_brothers.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PB_IN  = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v103.csv"
PB_OUT = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v104.csv"
PB_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"

TUAN_PID = "28565dd0-2196-5404-bf23-6cf0617ce79b"  # Tuan Vu (Disco Ninja)
TU_PID   = "c50fb80d-aa35-5154-be01-19817c3b84d2"  # Tu Vu (Huge)

# Allowlist of (event_id, place) tuples that should move from TUAN_PID to TU_PID.
# (event_id, place) is the primary key. Inside the move block, we additionally
# assert norm == 'tu vu' to ensure we mutate the right row at events where
# multiple disciplines/people share the place number.
EXPECTED_MOVES: set[tuple[str, str]] = {("910551956", "8")}


def main() -> None:
    if not PB_IN.exists():
        print(f"ERROR: {PB_IN} not found", file=sys.stderr); sys.exit(1)

    with open(PB_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        rows = list(reader)

    print(f"v103 input rows: {len(rows)}")

    moves = 0
    canon_fixes = 0
    move_log: list[dict] = []
    canon_log: list[dict] = []

    for i, row in enumerate(rows):
        key = (row["event_id"], row["place"])

        # === Move block: keyed by (event_id, place) ===
        if key in EXPECTED_MOVES:
            # Inside the candidate set, the safety guard discriminates which
            # of the rows at this (event_id, place) is actually the Tu Vu one.
            # Per Phase 2 contract: "original source name explicitly supports Tu".
            if row.get("norm") == "tu vu":
                # Hard sanity: this should be currently on Tuan's pid (otherwise
                # the move is already done; we shouldn't double-apply).
                assert row["person_id"] == TUAN_PID, (
                    f"row {i} at {key} has norm='tu vu' but person_id={row['person_id']!r}, "
                    f"expected TUAN_PID; aborting"
                )
                rows[i] = dict(row)
                rows[i]["person_id"] = TU_PID
                rows[i]["person_canon"] = "Tu Vu"
                moves += 1
                move_log.append({
                    "event_id": key[0], "place": key[1],
                    "division": row["division_canon"],
                    "norm": row["norm"],
                    "from_pid": TUAN_PID, "to_pid": TU_PID,
                })
                continue
            # Other rows at the same (event_id, place): leave alone (different
            # discipline / different person sharing the place number).

        # === Canon-fix block: keyed by (person_id == TU_PID, stale person_canon) ===
        if row["person_id"] == TU_PID and row.get("person_canon") == "Tuan Vu":
            rows[i] = dict(row)
            rows[i]["person_canon"] = "Tu Vu"
            canon_fixes += 1
            canon_log.append({
                "event_id": row["event_id"], "place": row["place"],
                "division": row["division_canon"], "norm": row["norm"],
            })

    # === Assertions ===
    assert moves == 1, f"expected 1 move, got {moves}"
    assert canon_fixes == 6, f"expected 6 canon fixes, got {canon_fixes}"

    # No row should remain with person_id=TU_PID and person_canon='Tuan Vu'.
    leftover = [
        (i, r) for i, r in enumerate(rows)
        if r["person_id"] == TU_PID and r.get("person_canon") == "Tuan Vu"
    ]
    assert not leftover, f"residual stale canon on {len(leftover)} Tu-pid rows: {leftover[:3]}"

    # Row count invariant.
    assert len(rows) == 27970, f"row count drift: {len(rows)} (expected 27970)"

    # Write versioned + version-free.
    with open(PB_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    shutil.copyfile(PB_OUT, PB_VERSION_FREE)

    print()
    print(f"Moves applied: {moves}")
    for m in move_log:
        print(f"  ({m['event_id']}, place {m['place']}) {m['division']} norm={m['norm']!r}: {m['from_pid'][:8]}... -> {m['to_pid'][:8]}...")

    print()
    print(f"Person_canon fixes: {canon_fixes} (Tuan Vu -> Tu Vu on already-Tu-pid rows)")
    for c in canon_log:
        print(f"  ({c['event_id']}, place {c['place']}) {c['division']} norm={c['norm']!r}")

    print()
    print(f"Output: {PB_OUT}")
    print(f"        {PB_VERSION_FREE} (version-free latest, copied from v104)")
    print(f"  v103 rows: {len(rows)}  v104 rows: {len(rows)}  delta: 0 (in-place edits only)")


if __name__ == "__main__":
    main()
