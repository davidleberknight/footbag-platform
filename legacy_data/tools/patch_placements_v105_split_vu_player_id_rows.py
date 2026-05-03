#!/usr/bin/env python3
"""
patch_placements_v105_split_vu_player_id_rows.py

Phase 4 of the Vu-brothers identity split (companion to v63 + v64 PT
patches and v104 placements patch).

  Phase 1 (v63 + person_aliases.csv): retargeted 'Tu Vu' alias to Tu's pid;
                                      removed 'Tu Vu' from Tuan's PT
                                      aliases_presentable.

  Phase 2 (v104 placements):          moved 1 high-confidence placement
                                      (event 910551956, place 8, norm='tu vu')
                                      from Tuan's pid to Tu's pid; corrected
                                      6 stale 'Tuan Vu' person_canon values.

  Phase 3 (v64 PT):                   moved 5 stage2 player_ids
                                      ('Tu Vu (US)', 'Tu Vu (USA)',
                                       'Tu Vu (U.S.A.)', 'Tu Vu (SF Bay Area)',
                                       'Tu Vu (San Francisco,CA -USA)') from
                                      Tuan's player_ids_seen to Tu's.

  Phase 4 (this patch):               propagates the Phase-3 PT split into
                                      the placements lock for the 5 rows
                                      that derive from those moved
                                      player_ids and were still attributed
                                      to Tuan in v104.

Block A — singles person-id flip (3 rows):
  EXPECTED_SINGLES_MOVES = (event_id, place, division_canon)
    (1069929277, 31, Open Singles Freestyle)  Tu Vu (USA) @ 2004 IFPA Worlds
    (941418343,  21, Open Singles Freestyle)  Tu Vu (San Francisco,CA -USA)
                                              @ 2000 Worlds
    (948198763,  7,  Open Freestyle)          Tu Vu (U.S.A.) @ 2000 European
  Pre-state: person_id == TUAN_PID, person_canon == 'Tuan Vu'
  Mutation:  person_id      Tuan -> Tu
             person_canon   'Tuan Vu' -> 'Tu Vu'
             norm           unchanged (Phase 2 contract: norm captures source)

Block B — doubles team_person_key rewrite (2 rows):
  EXPECTED_TEAM_KEY_MOVES = (event_id, place, division_canon)
    (941418343, 4, Open Doubles Freestyle)    Gehrman / Tu @ 2000 Worlds
    (948198763, 1, Open Doubles Freestyle)    Gehrman / Tu @ 2000 European
                                              (1st place)
  Pre-state: competitor_type == 'team', person_id == '',
             person_canon == '__NON_PERSON__',
             TUAN_PID present in team_person_key,
             'Tu Vu' present in team_display_name
  Mutation:  split team_person_key by '|', replace any TUAN_PID component
             with TU_PID, rejoin in the SAME ORDER (no resort).
             team_display_name unchanged.

Constraints honored (per user direction 2026-05-04):
  - EXPECTED_SINGLES_MOVES + EXPECTED_TEAM_KEY_MOVES are exact allowlists
  - team_person_key uses split-and-replace, not hardcoded post-state strings
  - No norm changes; no team_display_name changes
  - No edits to other rows; row count unchanged (27,970)

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v105_split_vu_player_id_rows.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PB_IN  = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v104.csv"
PB_OUT = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v105.csv"
PB_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"

TUAN_PID = "28565dd0-2196-5404-bf23-6cf0617ce79b"  # Tuan Vu (Disco Ninja)
TU_PID   = "c50fb80d-aa35-5154-be01-19817c3b84d2"  # Tu Vu (Huge)

# (event_id, place, division_canon) — strings as they appear in v104
EXPECTED_SINGLES_MOVES: set[tuple[str, str, str]] = {
    ("1069929277", "31", "Open Singles Freestyle"),
    ("941418343",  "21", "Open Singles Freestyle"),
    ("948198763",  "7",  "Open Freestyle"),
}

EXPECTED_TEAM_KEY_MOVES: set[tuple[str, str, str]] = {
    ("941418343", "4", "Open Doubles Freestyle"),
    ("948198763", "1", "Open Doubles Freestyle"),
}


def replace_pid_in_team_key(team_key: str, old_pid: str, new_pid: str) -> str:
    """Split on '|', replace exact matches of old_pid with new_pid, rejoin in same order."""
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

    print(f"v104 input rows: {len(rows)}")
    rows_before_count = len(rows)

    # Snapshot non-target rows for the "no other row mutated" assertion.
    target_indices: set[int] = set()
    singles_moves = 0
    team_moves = 0
    singles_log: list[dict] = []
    team_log: list[dict] = []

    for i, row in enumerate(rows):
        key = (row["event_id"], row["place"], row["division_canon"])

        # === Block A: singles flip ===
        # The (event_id, place, division_canon) key alone collides with many
        # other rows at the same place number; the discriminator is
        # `person_id == TUAN_PID`. Only that row gets mutated.
        if (
            key in EXPECTED_SINGLES_MOVES
            and row["competitor_type"] == "player"
            and row["person_id"] == TUAN_PID
        ):
            assert row["person_canon"] == "Tuan Vu", (
                f"row {i} {key}: pre-state person_canon={row['person_canon']!r}, expected 'Tuan Vu'"
            )
            old_pid = row["person_id"]
            old_canon = row["person_canon"]
            rows[i] = dict(row)
            rows[i]["person_id"] = TU_PID
            rows[i]["person_canon"] = "Tu Vu"
            singles_moves += 1
            target_indices.add(i)
            singles_log.append({
                "event_id": key[0], "place": key[1], "div": key[2],
                "from_pid": old_pid, "to_pid": TU_PID,
                "from_canon": old_canon, "to_canon": "Tu Vu",
                "norm": row.get("norm", ""),
            })
            continue  # singles row can't also be a team row

        # === Block B: doubles team_person_key rewrite ===
        # (event_id, place, division_canon) collides with other doubles teams
        # at the same place number (e.g., 2000 European place 1 also has
        # Sexton/Malin tied for 1st). Discriminator is TUAN_PID in
        # team_person_key.
        if (
            key in EXPECTED_TEAM_KEY_MOVES
            and row["competitor_type"] == "team"
            and TUAN_PID in (row.get("team_person_key") or "").split("|")
        ):
            tpk = row["team_person_key"]
            tdn = row["team_display_name"]
            assert "Tu Vu" in tdn, (
                f"row {i} {key}: 'Tu Vu' not in team_display_name={tdn!r}"
            )
            assert row["person_id"] == "", (
                f"row {i} {key}: pre-state person_id={row['person_id']!r}, expected '' on team row"
            )
            assert row["person_canon"] == "__NON_PERSON__", (
                f"row {i} {key}: pre-state person_canon={row['person_canon']!r}, expected '__NON_PERSON__'"
            )
            new_tpk = replace_pid_in_team_key(tpk, TUAN_PID, TU_PID)
            assert new_tpk != tpk, "team_person_key replace was a no-op"
            assert TUAN_PID not in new_tpk.split("|"), "TUAN_PID still in team_person_key after replace"
            assert TU_PID in new_tpk.split("|"), "TU_PID missing from team_person_key after replace"
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
    assert singles_moves == 3, f"expected 3 singles moves, got {singles_moves}"
    assert team_moves == 2, f"expected 2 team moves, got {team_moves}"
    assert len(rows) == rows_before_count, f"row count drift: {rows_before_count} -> {len(rows)}"

    # Phase 2 inherited integrity check: no row currently on TUAN_PID with norm=='tu vu'.
    leftover_tu_norm = [
        (i, r) for i, r in enumerate(rows)
        if r["person_id"] == TUAN_PID and r.get("norm") == "tu vu"
    ]
    assert not leftover_tu_norm, (
        f"residual TUAN_PID + norm='tu vu' rows: {len(leftover_tu_norm)}"
    )

    # Block-B post-state: no moved row's team_person_key still contains TUAN_PID.
    for i in target_indices:
        r = rows[i]
        if r["competitor_type"] == "team":
            assert TUAN_PID not in r["team_person_key"].split("|"), (
                f"moved team row {i} still has TUAN_PID in team_person_key"
            )
            assert TU_PID in r["team_person_key"].split("|"), (
                f"moved team row {i} missing TU_PID in team_person_key"
            )

    # Block-A post-state spot check.
    for i in target_indices:
        r = rows[i]
        if r["competitor_type"] == "player":
            assert r["person_id"] == TU_PID
            assert r["person_canon"] == "Tu Vu"

    # Re-read v104 to compare every untouched row byte-for-byte (no other row mutated).
    with open(PB_IN, newline="", encoding="utf-8") as f:
        original = list(csv.DictReader(f))
    assert len(original) == len(rows), "row count mismatch vs original on re-read"
    for i, (a, b) in enumerate(zip(original, rows)):
        if i in target_indices:
            continue
        assert a == b, f"unintended mutation at row {i}: original={a} new={b}"

    # Conservation check on team_person_key occurrences of Tuan vs Tu.
    def tpk_contains(rows, pid):
        return sum(1 for r in rows if pid in (r.get("team_person_key") or "").split("|"))

    tuan_tpk_before = tpk_contains(original, TUAN_PID)
    tuan_tpk_after  = tpk_contains(rows, TUAN_PID)
    tu_tpk_before   = tpk_contains(original, TU_PID)
    tu_tpk_after    = tpk_contains(rows, TU_PID)
    assert tuan_tpk_before - tuan_tpk_after == 2, (
        f"TUAN_PID team_key count delta: {tuan_tpk_before} -> {tuan_tpk_after} (expected -2)"
    )
    assert tu_tpk_after - tu_tpk_before == 2, (
        f"TU_PID team_key count delta: {tu_tpk_before} -> {tu_tpk_after} (expected +2)"
    )

    # === Write outputs ===
    with open(PB_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    shutil.copyfile(PB_OUT, PB_VERSION_FREE)

    # === Report ===
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
    print(f"team_person_key occurrences containing TUAN_PID: {tuan_tpk_before} -> {tuan_tpk_after}")
    print(f"team_person_key occurrences containing TU_PID:   {tu_tpk_before} -> {tu_tpk_after}")

    print()
    print(f"Output: {PB_OUT}")
    print(f"        {PB_VERSION_FREE} (version-free latest, copied from v105)")
    print(f"  v104 rows: {len(rows)}  v105 rows: {len(rows)}  delta: 0 (in-place edits only)")


if __name__ == "__main__":
    main()
