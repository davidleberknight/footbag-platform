#!/usr/bin/env python3
"""
patch_pt_v71_merge_premek.py

Merge `Premek Pietrzycki` (765859a9) into `Przemysław Pietrzycki` (8a15006e).

This is the same character-loss damage the previous patch repaired, on a row
that escaped it. `Przemek Pietrzycki` is already a verified alias of the
survivor in the alias registry, and `Premek Pietrzycki` is that spelling with
one letter dropped. The row was not caught alongside the other three only
because it carries a player id, so it did not match the unclaimable-orphan
shape.

The country recorded against the doomed row is not evidence of a second
person. A person row with no member account takes the country of its event,
and this row's single result is at a Slovak tournament while the survivor is
Polish. The same artifact was visible on `Ren Ruhr`, recorded as France
purely because its one result was at a French event.

Operations on the SURVIVOR row (8a15006e):
  player_ids_seen     6 ids -> 7, absorbing the doomed row's id
  player_names_seen   gains 'Premek Pietrzycki'
  aliases_presentable gains 'Premek Pietrzycki'
Then DELETE the DOOMED row (765859a9).

The doomed row owns one placement, so this patch has a companion:
patch_placements_v110_merge_premek.py remaps it. Run that one too.

Expected diff:
  - 1 row deleted, 0 added; PT row count 4075 -> 4074
  - 1 survivor row mutated
  - total unique player_ids unchanged; the doomed id moves to the survivor
  - no other PT row mutated

Input deviation from the older patch tools: they read the numbered
predecessor snapshot, but every intermediate snapshot is ignored by version
control, so those files exist on no checkout. This tool reads the
version-free file, which is always a copy of the newest snapshot, and
overwrites it in place. The version-free file is tracked, so a checkout of
that one path is the rollback, and a second run stops on its own
pre-condition checks rather than compounding the edit.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v71_merge_premek.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT_IN = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"
PT_OUT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v71.csv"
PT_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"

SURVIVOR_PID = "8a15006e-bc85-5621-bbe6-66090397b7d2"  # Przemysław Pietrzycki
DOOMED_PID = "765859a9-c027-51a9-b47c-0e8da93d568a"    # Premek Pietrzycki

SURVIVOR_CANON = "Przemysław Pietrzycki"
DOOMED_CANON = "Premek Pietrzycki"
DELIM = " | "


def parse_pipe(field_value: str) -> list[str]:
    return [p.strip() for p in (field_value or "").split("|") if p.strip()]


def emit_pipe(items: list[str]) -> str:
    return DELIM.join(items)


def main() -> None:
    if not PT_IN.exists():
        print(f"ERROR: {PT_IN} not found", file=sys.stderr)
        sys.exit(1)

    with open(PT_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        rows = list(reader)

    rows_before = len(rows)
    print(f"input rows: {rows_before}")

    survivor = next((r for r in rows if r["effective_person_id"] == SURVIVOR_PID), None)
    doomed = next((r for r in rows if r["effective_person_id"] == DOOMED_PID), None)
    if survivor is None:
        print(f"ERROR: survivor {SURVIVOR_PID} not found", file=sys.stderr)
        sys.exit(2)
    if doomed is None:
        print(f"ERROR: doomed {DOOMED_PID} not found", file=sys.stderr)
        sys.exit(2)

    doomed_player_ids = parse_pipe(doomed["player_ids_seen"])
    survivor_player_ids = parse_pipe(survivor["player_ids_seen"])

    # ─── Pre-conditions ──────────────────────────────────────────────────
    if survivor["person_canon"] != SURVIVOR_CANON:
        raise AssertionError(f"survivor canon is {survivor['person_canon']!r}")
    if doomed["person_canon"] != DOOMED_CANON:
        raise AssertionError(f"doomed canon is {doomed['person_canon']!r}")
    if len(doomed_player_ids) != 1:
        raise AssertionError(f"doomed expected 1 player id, got {len(doomed_player_ids)}")
    if len(survivor_player_ids) != 6:
        raise AssertionError(f"survivor expected 6 player ids, got {len(survivor_player_ids)}")
    if doomed["legacyid"].strip():
        raise AssertionError("doomed row carries a legacy account link")
    # The merge rests on this: the doomed spelling is one dropped letter from a
    # spelling already ruled to be the survivor.
    if "Przemek Pietrzycki" not in parse_pipe(survivor["aliases_presentable"]):
        raise AssertionError("survivor no longer carries the Przemek spelling")

    print("All pre-condition checks passed.")

    # ─── Conservation snapshot ───────────────────────────────────────────
    def all_pid_set(rows_iter: list[dict]) -> set[str]:
        s: set[str] = set()
        for r in rows_iter:
            s.update(parse_pipe(r["player_ids_seen"]))
        return s

    all_before = all_pid_set(rows)
    untouched_before = sorted(
        tuple((k, r[k]) for k in fieldnames)
        for r in rows
        if r["effective_person_id"] not in (SURVIVOR_PID, DOOMED_PID)
    )

    # ─── Mutate survivor, then delete doomed ─────────────────────────────
    survivor["player_ids_seen"] = emit_pipe(sorted(survivor_player_ids + doomed_player_ids))
    survivor["player_names_seen"] = emit_pipe(
        sorted(set(parse_pipe(survivor["player_names_seen"])) | {DOOMED_CANON})
    )
    survivor["aliases_presentable"] = emit_pipe(
        sorted(set(parse_pipe(survivor["aliases_presentable"])) | {DOOMED_CANON})
    )

    new_rows = [r for r in rows if r["effective_person_id"] != DOOMED_PID]

    # ─── Post-conditions ─────────────────────────────────────────────────
    if len(new_rows) != rows_before - 1:
        raise AssertionError(f"row delta {rows_before} -> {len(new_rows)}, expected -1")

    s = next(r for r in new_rows if r["effective_person_id"] == SURVIVOR_PID)
    if set(parse_pipe(s["player_ids_seen"])) != set(survivor_player_ids + doomed_player_ids):
        raise AssertionError("survivor player id set did not absorb the doomed id")
    if DOOMED_CANON not in parse_pipe(s["aliases_presentable"]):
        raise AssertionError("doomed spelling not preserved as an alias")
    if any(r["effective_person_id"] == DOOMED_PID for r in new_rows):
        raise AssertionError("doomed row still present")

    untouched_after = sorted(
        tuple((k, r[k]) for k in fieldnames)
        for r in new_rows
        if r["effective_person_id"] != SURVIVOR_PID
    )
    if untouched_after != untouched_before:
        raise AssertionError("a non-target PT row was modified")

    seen: dict[str, str] = {}
    for r in new_rows:
        for pid in parse_pipe(r["player_ids_seen"]):
            if seen.get(pid, r["effective_person_id"]) != r["effective_person_id"]:
                raise AssertionError(f"player_id {pid} on two rows")
            seen[pid] = r["effective_person_id"]

    all_after = all_pid_set(new_rows)
    if all_after != all_before:
        raise AssertionError(
            f"player_id set drift: gained={sorted(all_after - all_before)} "
            f"lost={sorted(all_before - all_after)}"
        )

    with open(PT_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(new_rows)
    shutil.copyfile(PT_OUT, PT_VERSION_FREE)

    print()
    print(f"doomed {DOOMED_PID[:8]}... {DOOMED_CANON!r}: DELETED")
    print(f"survivor player_ids_seen: {len(survivor_player_ids)} -> {len(parse_pipe(s['player_ids_seen']))}")
    print(f"survivor aliases_presentable: {s['aliases_presentable']!r}")
    print(f"rows: {rows_before} -> {len(new_rows)} (-1); wrote {PT_OUT.name} + version-free")
    print()
    print("Next: run tools/patch_placements_v110_merge_premek.py for the placement row.")


if __name__ == "__main__":
    main()
