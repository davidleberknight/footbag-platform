#!/usr/bin/env python3
"""
patch_pt_v65_merge_husted.py

Merge the Husted cluster — pid `a67698e9-...` (canonical 'Red Fred Husted')
into pid `10854ae3-...` (canonical 'Ethan Husted'). New canonical display
becomes 'Ethan Red Husted' (matches HoF index variant per `hof.csv:37`;
no embedded quotes per the pipeline's person-likeness invariant at
`pipeline/historical/export_historical_csvs.py:1316`).

Domain resolution (2026-05-04, James-confirmed): Red Husted, Shred Husted,
Ethan Husted, and Fred Husted are all the same person — Frederick Ethan
Mason Husted, nickname Red. The 'Red Fred Husted' canonical row was a
name-fragment misparse that incorrectly treated Frederick + nickname-Red
as a distinct identity. HoF (`hof.csv:37`) and BAP attribution both
already route to pid `10854ae3` via aliases.

Operations:
  - Update SURVIVOR row (pid `10854ae3`):
      canonical_name        Ethan Husted             -> Ethan "Red" Husted
      person_canon_clean    Ethan Husted             -> Ethan "Red" Husted
      player_ids_seen       6 IDs                    -> 8 IDs (union, lex-sorted, ' | ')
      player_names_seen     'Ethan Husted|Red Husted'-> 'Ethan Husted | Red Fred Husted | Red Husted'
                            (deduped union, sorted, ' | ')
      aliases_presentable   'Ethan Red Husted'       -> 'Ethan Red Husted | Red Fred Husted'
                            (absorbs doomed's 'Red Fred Husted'; drops OCR fragment 'red usted')
      All other fields unchanged.
  - DELETE DOOMED row (pid `a67698e9`).

Constraints (per user direction 2026-05-04):
  - Survivor pid 10854ae3 (more placements, has legacyid, attached to HoF)
  - New canonical 'Ethan "Red" Husted' (matches HoF index variant)
  - Drop 'red usted' OCR fragment from absorbed aliases
  - Absorb only 'Red Fred Husted' from doomed's aliases_presentable

Expected v64 -> v65 diff:
  - 1 row deleted (doomed pid)
  - 1 row mutated (survivor pid)
  - PT row count: 4090 -> 4089
  - Total unique player_ids across all rows: unchanged (8 = 6 + 2; just regrouped)
  - No other row mutated

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v65_merge_husted.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT_IN  = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v64.csv"
PT_OUT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v65.csv"
PT_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"

SURVIVOR_PID = "10854ae3-60d7-51a7-ad9a-36033b541bd9"  # Ethan Husted (canonical pre-merge)
DOOMED_PID   = "a67698e9-2dd8-5853-b75a-3c6e535d7610"  # Red Fred Husted (mislabeled fragment)

NEW_CANONICAL = "Ethan Red Husted"

# Aliases from doomed row to absorb into survivor's aliases_presentable.
# Excludes 'red usted' (OCR fragment, low signal — dropped per direction).
ABSORB_ALIASES_FROM_DOOMED = {"Red Fred Husted"}

DELIM = " | "


def parse_pipe(field: str) -> list[str]:
    """Split a pipe-separated field into clean tokens; strips inconsistent whitespace."""
    return [p.strip() for p in (field or "").split("|") if p.strip()]


def emit_pipe(items: list[str]) -> str:
    return DELIM.join(items)


def main() -> None:
    if not PT_IN.exists():
        print(f"ERROR: {PT_IN} not found", file=sys.stderr); sys.exit(1)

    with open(PT_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        rows = list(reader)

    print(f"v64 input rows: {len(rows)}")
    rows_before_count = len(rows)

    # Locate survivor + doomed
    survivor = next((r for r in rows if r["effective_person_id"] == SURVIVOR_PID), None)
    doomed   = next((r for r in rows if r["effective_person_id"] == DOOMED_PID),   None)
    if survivor is None:
        print(f"ERROR: survivor pid {SURVIVOR_PID} not found in v64", file=sys.stderr); sys.exit(2)
    if doomed is None:
        print(f"ERROR: doomed pid {DOOMED_PID} not found in v64", file=sys.stderr); sys.exit(2)

    # Pre-state snapshots
    survivor_player_ids_before  = parse_pipe(survivor["player_ids_seen"])
    survivor_names_before       = parse_pipe(survivor["player_names_seen"])
    survivor_aliases_before     = parse_pipe(survivor["aliases_presentable"])
    doomed_player_ids           = parse_pipe(doomed["player_ids_seen"])
    doomed_names                = parse_pipe(doomed["player_names_seen"])

    # Pre-conditions
    assert survivor["person_canon"] == "Ethan Husted", \
        f"survivor pre-state canonical_name unexpected: {survivor['person_canon']!r}"
    assert doomed["person_canon"] == "Red Fred Husted", \
        f"doomed pre-state canonical_name unexpected: {doomed['person_canon']!r}"
    assert len(survivor_player_ids_before) == 6, \
        f"survivor expected 6 player_ids, got {len(survivor_player_ids_before)}"
    assert len(doomed_player_ids) == 2, \
        f"doomed expected 2 player_ids, got {len(doomed_player_ids)}"
    assert not (set(survivor_player_ids_before) & set(doomed_player_ids)), \
        "player_ids overlap between survivor and doomed (unexpected)"

    # Snapshot of all OTHER rows for tamper check
    untouched_indices: list[int] = []
    for i, r in enumerate(rows):
        if r["effective_person_id"] not in (SURVIVOR_PID, DOOMED_PID):
            untouched_indices.append(i)
    untouched_before = [(i, tuple((k, rows[i][k]) for k in fieldnames)) for i in untouched_indices]

    # Conservation: total unique player_ids across all rows
    def all_pid_set(rows: list[dict]) -> set[str]:
        s: set[str] = set()
        for r in rows:
            s.update(parse_pipe(r["player_ids_seen"]))
        return s
    all_before = all_pid_set(rows)

    # === Mutations on survivor ===
    survivor["person_canon"]           = NEW_CANONICAL
    survivor["person_canon_clean"]     = NEW_CANONICAL
    survivor["player_ids_seen"]        = emit_pipe(sorted(set(survivor_player_ids_before) | set(doomed_player_ids)))
    survivor["player_names_seen"]      = emit_pipe(sorted(set(survivor_names_before) | set(doomed_names)))
    survivor["aliases_presentable"]    = emit_pipe(sorted(set(survivor_aliases_before) | ABSORB_ALIASES_FROM_DOOMED))

    # === Delete doomed row ===
    new_rows = [r for r in rows if r["effective_person_id"] != DOOMED_PID]

    # === Post-assertions ===
    assert len(new_rows) == rows_before_count - 1, \
        f"row count delta: {rows_before_count} -> {len(new_rows)} (expected -1)"

    # Survivor post-state
    survivor_after = next((r for r in new_rows if r["effective_person_id"] == SURVIVOR_PID), None)
    assert survivor_after is not None, "survivor row vanished"
    assert survivor_after["person_canon"] == NEW_CANONICAL
    assert survivor_after["person_canon_clean"] == NEW_CANONICAL
    pids_after = parse_pipe(survivor_after["player_ids_seen"])
    assert len(pids_after) == 8, f"survivor player_ids count: {len(pids_after)} (expected 8)"
    assert set(pids_after) == set(survivor_player_ids_before) | set(doomed_player_ids)
    assert "Red Fred Husted" in parse_pipe(survivor_after["aliases_presentable"])
    assert "red usted" not in parse_pipe(survivor_after["aliases_presentable"]), \
        "OCR fragment 'red usted' should NOT be in absorbed aliases"

    # Doomed pid absent
    assert not any(r["effective_person_id"] == DOOMED_PID for r in new_rows), \
        "DOOMED_PID still present in PT after delete"

    # No other row mutated
    for i, _ in enumerate(new_rows):
        # Must be an originally-untouched row, OR the survivor (which we explicitly mutated)
        if new_rows[i]["effective_person_id"] == SURVIVOR_PID:
            continue
        # Find this row in untouched_before by matching effective_person_id
        # Simpler: build untouched_after and compare set semantics.
    untouched_after = [
        tuple((k, r[k]) for k in fieldnames)
        for r in new_rows
        if r["effective_person_id"] != SURVIVOR_PID
    ]
    assert sorted(untouched_after) == sorted(t[1] for t in untouched_before), \
        "a non-target PT row was modified during merge"

    # No player_id appears on more than one row
    seen: dict[str, str] = {}
    for r in new_rows:
        for pid in parse_pipe(r["player_ids_seen"]):
            if pid in seen and seen[pid] != r["effective_person_id"]:
                raise AssertionError(
                    f"player_id {pid} on both {seen[pid]} and {r['effective_person_id']}"
                )
            seen[pid] = r["effective_person_id"]

    # Total unique player_ids unchanged (8 IDs from doomed + survivor are now all on survivor)
    all_after = all_pid_set(new_rows)
    assert all_after == all_before, \
        f"player_id set drift: gained={sorted(all_after - all_before)} lost={sorted(all_before - all_after)}"

    # === Write outputs ===
    with open(PT_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(new_rows)
    shutil.copyfile(PT_OUT, PT_VERSION_FREE)

    print()
    print(f"Survivor row ({SURVIVOR_PID[:8]}...):")
    print(f"  canonical_name: 'Ethan Husted' -> {NEW_CANONICAL!r}")
    print(f"  player_ids_seen: {len(survivor_player_ids_before)} -> {len(pids_after)}")
    print(f"  aliases_presentable: {survivor_aliases_before} -> {parse_pipe(survivor_after['aliases_presentable'])}")
    print()
    print(f"Doomed row ({DOOMED_PID[:8]}...): DELETED")
    print()
    print(f"Output: {PT_OUT}")
    print(f"        {PT_VERSION_FREE} (version-free latest, copied from v65)")
    print(f"  v64 rows: {rows_before_count}  v65 rows: {len(new_rows)}  delta: -1 (1 deletion + 1 update)")
    print(f"  unique player_ids: {len(all_before)} -> {len(all_after)} (unchanged)")


if __name__ == "__main__":
    main()
