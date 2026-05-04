#!/usr/bin/env python3
"""
patch_placements_v106_merge_husted.py

Companion to patch_pt_v65_merge_husted.py. Reattributes 3 placement rows
from doomed pid `a67698e9-...` ('Red Fred Husted') to survivor pid
`10854ae3-...` ('Ethan Red Husted' post-merge — no embedded quotes per
the pipeline's person-likeness invariant).

Block A — singles person_id flip (2 rows):
  EXPECTED_SINGLES_MOVES = (event_id, place, division_canon)
    (1096318324, 5, Sick 3)                     2004 sick_3 (norm='red fred husted')
    (876356874,  7, Open Singles Freestyle)     1998 westregion (norm='red fred husted')
  Pre-state: person_id == DOOMED_PID, person_canon == 'Red Fred Husted'
  Mutation:  person_id      DOOMED -> SURVIVOR
             person_canon   'Red Fred Husted' -> 'Ethan "Red" Husted'
             norm           unchanged (Phase 2 contract: norm captures source)

Block B — doubles team_person_key rewrite (1 row):
  EXPECTED_TEAM_KEY_MOVES = (event_id, place, division_canon)
    (859923755, 3, Novice Doubles)              1997 ca_state w/ Sunil Jani
  Pre-state: competitor_type == 'team', person_id == '',
             person_canon == '__NON_PERSON__',
             DOOMED_PID present in team_person_key
  Mutation:  split team_person_key by '|', replace DOOMED_PID with
             SURVIVOR_PID, rejoin in SAME order (no resort).
             team_display_name unchanged (historical raw at ingest;
             downstream renderers re-derive display from PT).

Constraints honored (per user direction 2026-05-04):
  - Allowlists are exact (event_id, place, division_canon) tuples
  - Per-row discriminator inside candidate filter (per project_identity_lock_patch_keying):
      Block A: person_id == DOOMED_PID
      Block B: DOOMED_PID in team_person_key.split('|')
  - team_person_key uses split-and-replace, not hardcoded post-state
  - No norm changes; no team_display_name changes
  - Row count unchanged (27,970)

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v106_merge_husted.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PB_IN  = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v105.csv"
PB_OUT = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v106.csv"
PB_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"

SURVIVOR_PID = "10854ae3-60d7-51a7-ad9a-36033b541bd9"
DOOMED_PID   = "a67698e9-2dd8-5853-b75a-3c6e535d7610"

NEW_CANONICAL = "Ethan Red Husted"

EXPECTED_SINGLES_MOVES: set[tuple[str, str, str]] = {
    ("1096318324", "5", "Sick 3"),
    ("876356874",  "7", "Open Singles Freestyle"),
}

EXPECTED_TEAM_KEY_MOVES: set[tuple[str, str, str]] = {
    ("859923755", "3", "Novice Doubles"),
}


def replace_pid_in_team_key(team_key: str, old_pid: str, new_pid: str) -> str:
    parts = team_key.split("|")
    out = [new_pid if p == old_pid else p for p in parts]
    return "|".join(out)


def main() -> None:
    if not PB_IN.exists():
        print(f"ERROR: {PB_IN} not found", file=sys.stderr); sys.exit(1)

    with open(PB_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        rows = list(reader)

    print(f"v105 input rows: {len(rows)}")
    rows_before_count = len(rows)

    target_indices: set[int] = set()
    singles_moves = 0
    team_moves = 0
    singles_log: list[dict] = []
    team_log: list[dict] = []

    for i, row in enumerate(rows):
        key = (row["event_id"], row["place"], row["division_canon"])

        # === Block A: singles flip ===
        # Discriminator: person_id == DOOMED_PID inside the candidate set
        # (per project_identity_lock_patch_keying — match-key alone is not unique).
        if (
            key in EXPECTED_SINGLES_MOVES
            and row["competitor_type"] == "player"
            and row["person_id"] == DOOMED_PID
        ):
            assert row["person_canon"] == "Red Fred Husted", (
                f"row {i} {key}: pre-state person_canon={row['person_canon']!r}, expected 'Red Fred Husted'"
            )
            old_canon = row["person_canon"]
            rows[i] = dict(row)
            rows[i]["person_id"] = SURVIVOR_PID
            rows[i]["person_canon"] = NEW_CANONICAL
            singles_moves += 1
            target_indices.add(i)
            singles_log.append({
                "event_id": key[0], "place": key[1], "div": key[2],
                "from_pid": DOOMED_PID, "to_pid": SURVIVOR_PID,
                "from_canon": old_canon, "to_canon": NEW_CANONICAL,
                "norm": row.get("norm", ""),
            })
            continue  # singles row can't also be a team row

        # === Block B: team_person_key rewrite ===
        # Discriminator: DOOMED_PID present in team_person_key (within the
        # candidate set; multiple teams may tie at the same place).
        if (
            key in EXPECTED_TEAM_KEY_MOVES
            and row["competitor_type"] == "team"
            and DOOMED_PID in (row.get("team_person_key") or "").split("|")
        ):
            tpk = row["team_person_key"]
            tdn = row["team_display_name"]
            assert row["person_id"] == "", (
                f"row {i} {key}: pre-state person_id={row['person_id']!r}, expected '' on team row"
            )
            assert row["person_canon"] == "__NON_PERSON__", (
                f"row {i} {key}: pre-state person_canon={row['person_canon']!r}, expected '__NON_PERSON__'"
            )
            new_tpk = replace_pid_in_team_key(tpk, DOOMED_PID, SURVIVOR_PID)
            assert new_tpk != tpk, "team_person_key replace was a no-op"
            assert DOOMED_PID not in new_tpk.split("|"), "DOOMED_PID still in team_person_key after replace"
            assert SURVIVOR_PID in new_tpk.split("|"), "SURVIVOR_PID missing from team_person_key after replace"
            rows[i] = dict(row)
            rows[i]["team_person_key"] = new_tpk
            team_moves += 1
            target_indices.add(i)
            team_log.append({
                "event_id": key[0], "place": key[1], "div": key[2],
                "old_tpk": tpk, "new_tpk": new_tpk,
                "team_display_name": tdn,
            })

    # === Top-level assertions ===
    assert singles_moves == 2, f"expected 2 singles moves, got {singles_moves}"
    assert team_moves == 1, f"expected 1 team move, got {team_moves}"
    assert len(rows) == rows_before_count, f"row count drift: {rows_before_count} -> {len(rows)}"

    # No row remains where person_id == DOOMED_PID
    leftover_singles = [(i, r) for i, r in enumerate(rows) if r["person_id"] == DOOMED_PID]
    assert not leftover_singles, (
        f"residual person_id == DOOMED_PID rows: {len(leftover_singles)}"
    )

    # No row remains where DOOMED_PID is in team_person_key
    leftover_team = [
        (i, r) for i, r in enumerate(rows)
        if DOOMED_PID in (r.get("team_person_key") or "").split("|")
    ]
    assert not leftover_team, (
        f"residual DOOMED_PID in team_person_key rows: {len(leftover_team)}"
    )

    # Block-B post-state invariant
    for i in target_indices:
        r = rows[i]
        if r["competitor_type"] == "team":
            assert SURVIVOR_PID in r["team_person_key"].split("|")

    # Block-A post-state invariant
    for i in target_indices:
        r = rows[i]
        if r["competitor_type"] == "player":
            assert r["person_id"] == SURVIVOR_PID
            assert r["person_canon"] == NEW_CANONICAL

    # Conservation check on team_person_key occurrences
    with open(PB_IN, newline="", encoding="utf-8") as f:
        original = list(csv.DictReader(f))
    assert len(original) == len(rows), "row count mismatch vs original on re-read"
    for i, (a, b) in enumerate(zip(original, rows)):
        if i in target_indices:
            continue
        assert a == b, f"unintended mutation at row {i}: original={a} new={b}"

    def tpk_contains(rows, pid):
        return sum(1 for r in rows if pid in (r.get("team_person_key") or "").split("|"))

    doomed_tpk_before = tpk_contains(original, DOOMED_PID)
    doomed_tpk_after  = tpk_contains(rows, DOOMED_PID)
    survivor_tpk_before = tpk_contains(original, SURVIVOR_PID)
    survivor_tpk_after  = tpk_contains(rows, SURVIVOR_PID)
    assert doomed_tpk_before - doomed_tpk_after == 1, (
        f"DOOMED_PID team_key count delta: {doomed_tpk_before} -> {doomed_tpk_after} (expected -1)"
    )
    assert survivor_tpk_after - survivor_tpk_before == 1, (
        f"SURVIVOR_PID team_key count delta: {survivor_tpk_before} -> {survivor_tpk_after} (expected +1)"
    )

    # === Write outputs ===
    with open(PB_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    shutil.copyfile(PB_OUT, PB_VERSION_FREE)

    print()
    print(f"Block A — singles moves: {singles_moves}")
    for m in singles_log:
        print(f"  ({m['event_id']}, place {m['place']}) {m['div']!r}  norm={m['norm']!r}")
        print(f"    {m['from_pid'][:8]}... -> {m['to_pid'][:8]}...  canon: {m['from_canon']!r} -> {m['to_canon']!r}")

    print()
    print(f"Block B — team_person_key rewrites: {team_moves}")
    for m in team_log:
        print(f"  ({m['event_id']}, place {m['place']}) {m['div']!r}")
        print(f"    team_display_name={m['team_display_name']!r}")
        print(f"    old: {m['old_tpk']}")
        print(f"    new: {m['new_tpk']}")

    print()
    print(f"team_person_key occurrences containing DOOMED_PID:   {doomed_tpk_before} -> {doomed_tpk_after}")
    print(f"team_person_key occurrences containing SURVIVOR_PID: {survivor_tpk_before} -> {survivor_tpk_after}")

    print()
    print(f"Output: {PB_OUT}")
    print(f"        {PB_VERSION_FREE} (version-free latest, copied from v106)")
    print(f"  v105 rows: {rows_before_count}  v106 rows: {len(rows)}  delta: 0 (in-place edits only)")


if __name__ == "__main__":
    main()
