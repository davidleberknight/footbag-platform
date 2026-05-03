#!/usr/bin/env python3
"""
patch_pt_v64_split_vu_player_ids.py

Phase 3 of the Vu-brothers identity split (companion to v63 + v104).

  Phase 1 (v63 + person_aliases.csv): retargeted 'Tu Vu' alias to Tu's pid;
                                      removed 'Tu Vu' from Tuan's PT
                                      aliases_presentable.

  Phase 2 (v104 placements):          moved 1 high-confidence placement
                                      (event 910551956, place 8, norm='tu vu')
                                      from Tuan's pid to Tu's pid; corrected
                                      6 stale 'Tuan Vu' person_canon values
                                      on rows already pointing at Tu's pid.

  Phase 3 (this patch):               splits 5 stage2 player_ids that the
                                      pipeline merged into Tuan's PT row's
                                      player_ids_seen list back to Tu's
                                      row, where stage2 raw_name evidence
                                      explicitly supports Tu, not Tuan:

                                        02973bf4 'Tu Vu (US)'
                                        0a1e7dbd 'Tu Vu (USA)'
                                        22a5c402 'Tu Vu (U.S.A.)'
                                        2cb00077 'Tu Vu (SF Bay Area)'
                                        3321f376 'Tu Vu (San Francisco,CA -USA)'

  Phase 4 (deferred):                 6 placements still locked on Tuan's
                                      pid for these player_ids will need a
                                      placements patch once Phase 3 lands.
                                      Not in scope here.

Constraints honored (per user direction 2026-05-04):
  - SAFE_MOVES is an explicit allowlist of 5 player_ids
  - Pre-checks: every SAFE_MOVE id must currently be in Tuan's row and absent
    from Tu's row; abort otherwise
  - Operations: remove from Tuan; add to Tu; re-sort lexicographically;
    re-emit with " | " delimiter (existing format)
  - No edits to any other field on either row
  - No edits to any other row in PT
  - Do NOT touch placements

Expected v63 → v64 diff:
  - Tu row (c50fb80d): player_ids_seen 3 → 8
  - Tuan row (28565dd0): player_ids_seen 21 → 16
  - Total PT row count unchanged (4090)
  - Total unique player_ids across all rows unchanged

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v64_split_vu_player_ids.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT_IN  = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v63.csv"
PT_OUT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v64.csv"
PT_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"

TU_PID   = "c50fb80d-aa35-5154-be01-19817c3b84d2"  # Tu Vu (Huge)
TUAN_PID = "28565dd0-2196-5404-bf23-6cf0617ce79b"  # Tuan Vu (Disco Ninja)

SAFE_MOVES: set[str] = {
    "02973bf4-0030-5223-90d0-d9364b6ac484",  # Tu Vu (US)
    "0a1e7dbd-d340-5cde-8486-728ca5e03e4a",  # Tu Vu (USA)
    "22a5c402-0dbc-5af0-89fa-ea5a0689054b",  # Tu Vu (U.S.A.)
    "2cb00077-ecd1-5c1c-9337-dd70e63b5179",  # Tu Vu (SF Bay Area)
    "3321f376-4093-572a-88a6-08a7ce50bd68",  # Tu Vu (San Francisco,CA -USA)
}

DELIM = " | "


def parse_ids(field: str) -> list[str]:
    return [p.strip() for p in (field or "").split("|") if p.strip()]


def emit_ids(ids: list[str]) -> str:
    return DELIM.join(sorted(set(ids)))


def main() -> None:
    if not PT_IN.exists():
        print(f"ERROR: {PT_IN} not found", file=sys.stderr); sys.exit(1)

    with open(PT_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        rows = list(reader)

    print(f"v63 input rows: {len(rows)}")

    tu_row = next((r for r in rows if r["effective_person_id"] == TU_PID), None)
    tuan_row = next((r for r in rows if r["effective_person_id"] == TUAN_PID), None)
    if tu_row is None:
        print(f"ERROR: Tu pid {TU_PID} not found in v63", file=sys.stderr); sys.exit(2)
    if tuan_row is None:
        print(f"ERROR: Tuan pid {TUAN_PID} not found in v63", file=sys.stderr); sys.exit(2)

    tu_before  = parse_ids(tu_row["player_ids_seen"])
    tuan_before = parse_ids(tuan_row["player_ids_seen"])

    # --- Preconditions -------------------------------------------------------
    missing_from_tuan = SAFE_MOVES - set(tuan_before)
    assert not missing_from_tuan, (
        f"precondition failed: {len(missing_from_tuan)} SAFE_MOVES not on Tuan's row: "
        f"{sorted(missing_from_tuan)}"
    )
    already_on_tu = SAFE_MOVES & set(tu_before)
    assert not already_on_tu, (
        f"precondition failed: {len(already_on_tu)} SAFE_MOVES already on Tu's row: "
        f"{sorted(already_on_tu)}"
    )

    # Snapshot of all NON-target other fields on the two rows for tamper check.
    def other_fields(r: dict) -> tuple:
        return tuple((k, r[k]) for k in fieldnames if k != "player_ids_seen")

    tu_other_before  = other_fields(tu_row)
    tuan_other_before = other_fields(tuan_row)

    # Snapshot of all rows except Tu/Tuan for the no-other-row-changed assertion.
    untouched_before = [
        (i, tuple((k, r[k]) for k in fieldnames))
        for i, r in enumerate(rows)
        if r["effective_person_id"] not in (TU_PID, TUAN_PID)
    ]

    # Set-of-all-player_ids snapshot for the conservation invariant.
    def all_pid_set(rows: list[dict]) -> set[str]:
        s: set[str] = set()
        for r in rows:
            s.update(parse_ids(r["player_ids_seen"]))
        return s

    all_before = all_pid_set(rows)
    rows_before_count = len(rows)

    # --- Operations ----------------------------------------------------------
    tu_after_set   = set(tu_before)   | SAFE_MOVES
    tuan_after_set = set(tuan_before) - SAFE_MOVES

    tu_row["player_ids_seen"]   = emit_ids(sorted(tu_after_set))
    tuan_row["player_ids_seen"] = emit_ids(sorted(tuan_after_set))

    # --- Post-assertions -----------------------------------------------------
    tu_after  = parse_ids(tu_row["player_ids_seen"])
    tuan_after = parse_ids(tuan_row["player_ids_seen"])

    assert len(tuan_after) == len(tuan_before) - 5, (
        f"Tuan row count delta: {len(tuan_before)} -> {len(tuan_after)} (expected -5)"
    )
    assert len(tu_after) == len(tu_before) + 5, (
        f"Tu row count delta: {len(tu_before)} -> {len(tu_after)} (expected +5)"
    )
    assert SAFE_MOVES.issubset(tu_after), "SAFE_MOVES not fully present on Tu's row after edit"
    assert not (SAFE_MOVES & set(tuan_after)), "SAFE_MOVES still present on Tuan's row after edit"
    assert set(tu_before).issubset(tu_after), "lost a pre-existing Tu pid"
    assert set(tuan_after).issubset(tuan_before), "gained a non-SAFE_MOVE pid on Tuan"

    # No other field on Tu or Tuan changed.
    assert other_fields(tu_row) == tu_other_before, "non-target field changed on Tu row"
    assert other_fields(tuan_row) == tuan_other_before, "non-target field changed on Tuan row"

    # No other row changed.
    untouched_after = [
        (i, tuple((k, r[k]) for k in fieldnames))
        for i, r in enumerate(rows)
        if r["effective_person_id"] not in (TU_PID, TUAN_PID)
    ]
    assert untouched_after == untouched_before, "a non-target PT row was modified"

    # No player_id appears on more than one row anywhere.
    seen: dict[str, str] = {}
    for r in rows:
        for pid in parse_ids(r["player_ids_seen"]):
            if pid in seen and seen[pid] != r["effective_person_id"]:
                raise AssertionError(
                    f"player_id {pid} appears on both {seen[pid]} and {r['effective_person_id']}"
                )
            seen[pid] = r["effective_person_id"]

    # Total unique player_ids unchanged.
    all_after = all_pid_set(rows)
    assert all_after == all_before, (
        f"player_id set changed: gained={sorted(all_after - all_before)} "
        f"lost={sorted(all_before - all_after)}"
    )

    # Row count unchanged.
    assert len(rows) == rows_before_count, f"row count drift: {rows_before_count} -> {len(rows)}"

    # --- Write outputs -------------------------------------------------------
    with open(PT_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    shutil.copyfile(PT_OUT, PT_VERSION_FREE)

    print()
    print(f"Tu row   ({TU_PID[:8]}...): player_ids_seen {len(tu_before)} -> {len(tu_after)}")
    for pid in sorted(SAFE_MOVES):
        print(f"  + {pid}")
    print()
    print(f"Tuan row ({TUAN_PID[:8]}...): player_ids_seen {len(tuan_before)} -> {len(tuan_after)}")
    for pid in sorted(SAFE_MOVES):
        print(f"  - {pid}")

    print()
    print(f"Output: {PT_OUT}")
    print(f"        {PT_VERSION_FREE} (version-free latest, copied from v64)")
    print(f"  v63 rows: {len(rows)}  v64 rows: {len(rows)}  delta: 0 (cell-edit only)")
    print(f"  unique player_ids: {len(all_before)} -> {len(all_after)} (unchanged)")


if __name__ == "__main__":
    main()
