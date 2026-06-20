#!/usr/bin/env python3
"""
patch_pt_v69_merge_nycz.py

Merge the Nycz cluster: pid `07f95465-470d-502b-804d-643380e1385c`
(canonical 'Gosia Nycz', 2 player_ids) into pid
`e6f5c3f9-b642-52a2-a6b4-9d8037fa5a83` (canonical 'Małgorzata Nycz').

Gosia and Małgorzata are the same Polish player: Małgorzata is the formal
given name, Gosia is its common diminutive. The split arose from name-form
variance in event records; the two ids never co-occur in any event, share the
surname and country, and both carry the identical Wiktor Debski doubles
partnership (16 + 4 appearances) -- one partnership recorded under two name
forms. The survivor keeps the formal canonical 'Małgorzata Nycz'; 'Gosia Nycz'
is retained as an alias.

This patch also repairs the survivor's lingering mojibake: its
player_names_seen / aliases / aliases_presentable still held the broken
'Ma?gorzata' / 'Ma gorzata' forms (the proper 'l-stroke' decoded to a space or
a replacement char). They are rewritten to the correct 'Małgorzata Nycz'.

Operations on the SURVIVOR row (pid e6f5c3f9):
  person_canon          'Małgorzata Nycz'  (unchanged; already correct)
  person_canon_clean    'Małgorzata Nycz'  (unchanged)
  player_ids_seen       (empty)            -> the 2 ids absorbed from doomed
  player_names_seen     'Ma?gorzata Nycz'  -> 'Gosia Nycz | Małgorzata Nycz'
  aliases               'Ma?gorzata Nycz'  -> 'Gosia Nycz | Małgorzata Nycz'
  alias_statuses        'verified'         -> 'verified | verified'
  aliases_presentable   'Ma gorzata Nycz | Ma?gorzata Nycz' -> 'Gosia Nycz | Małgorzata Nycz'
  source                'overrides_only'   -> 'overrides+data'  (now carries player ids)
Then DELETE the DOOMED row (pid 07f95465).

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v69_merge_nycz.py
"""
from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT_IN = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v68.csv"
PT_OUT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v69.csv"
PT_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"

SURVIVOR_PID = "e6f5c3f9-b642-52a2-a6b4-9d8037fa5a83"  # Małgorzata Nycz
DOOMED_PID = "07f95465-470d-502b-804d-643380e1385c"    # Gosia Nycz

CANON = "Małgorzata Nycz"
NAMES = ["Gosia Nycz", "Małgorzata Nycz"]
DELIM = " | "


def parse_pipe(field: str) -> list[str]:
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

    rows_before = len(rows)
    print(f"v68 input rows: {rows_before}")

    survivor = next((r for r in rows if r["effective_person_id"] == SURVIVOR_PID), None)
    doomed = next((r for r in rows if r["effective_person_id"] == DOOMED_PID), None)
    if survivor is None:
        print(f"ERROR: survivor {SURVIVOR_PID} not found", file=sys.stderr); sys.exit(2)
    if doomed is None:
        print(f"ERROR: doomed {DOOMED_PID} not found", file=sys.stderr); sys.exit(2)

    doomed_player_ids = parse_pipe(doomed["player_ids_seen"])

    # Pre-conditions
    assert survivor["person_canon"] == CANON, f"survivor canon {survivor['person_canon']!r}"
    assert survivor["person_canon_clean"] == CANON, f"survivor canon_clean {survivor['person_canon_clean']!r}"
    assert doomed["person_canon"] == "Gosia Nycz", f"doomed canon {doomed['person_canon']!r}"
    assert parse_pipe(survivor["player_ids_seen"]) == [], "survivor expected 0 player_ids"
    assert len(doomed_player_ids) == 2, f"doomed expected 2 player_ids, got {len(doomed_player_ids)}"

    # Snapshot every other row to prove they are untouched.
    untouched_before = sorted(
        tuple((k, r[k]) for k in fieldnames)
        for r in rows
        if r["effective_person_id"] not in (SURVIVOR_PID, DOOMED_PID)
    )

    def all_pids(rs: list[dict]) -> set[str]:
        s: set[str] = set()
        for r in rs:
            s.update(parse_pipe(r["player_ids_seen"]))
        return s
    all_before = all_pids(rows)

    # === Mutate survivor (merge + mojibake repair) ===
    survivor["player_ids_seen"] = emit_pipe(sorted(doomed_player_ids))
    survivor["player_names_seen"] = emit_pipe(NAMES)
    survivor["aliases"] = emit_pipe(NAMES)
    survivor["alias_statuses"] = emit_pipe(["verified", "verified"])
    survivor["aliases_presentable"] = emit_pipe(NAMES)
    survivor["source"] = "overrides+data"

    # === Delete doomed ===
    new_rows = [r for r in rows if r["effective_person_id"] != DOOMED_PID]

    # === Post-conditions ===
    assert len(new_rows) == rows_before - 1, f"row delta {rows_before}->{len(new_rows)}"
    s = next(r for r in new_rows if r["effective_person_id"] == SURVIVOR_PID)
    assert set(parse_pipe(s["player_ids_seen"])) == set(doomed_player_ids)
    assert "Gosia Nycz" in parse_pipe(s["aliases_presentable"])
    assert "Małgorzata Nycz" in parse_pipe(s["aliases_presentable"])
    blob = "".join(s[k] for k in fieldnames)
    assert "Ma?gorzata" not in blob and "Ma gorzata" not in blob, "mojibake remains on survivor"
    assert not any(r["effective_person_id"] == DOOMED_PID for r in new_rows), "doomed still present"

    untouched_after = sorted(
        tuple((k, r[k]) for k in fieldnames)
        for r in new_rows
        if r["effective_person_id"] != SURVIVOR_PID
    )
    assert untouched_after == untouched_before, "a non-target row was modified"

    seen: dict[str, str] = {}
    for r in new_rows:
        for pid in parse_pipe(r["player_ids_seen"]):
            assert seen.get(pid, r["effective_person_id"]) == r["effective_person_id"], \
                f"player_id {pid} on two rows"
            seen[pid] = r["effective_person_id"]
    assert all_pids(new_rows) == all_before, "player_id set drift"

    with open(PT_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(new_rows)
    shutil.copyfile(PT_OUT, PT_VERSION_FREE)

    print(f"survivor player_ids_seen: 0 -> {len(doomed_player_ids)}")
    print(f"survivor aliases_presentable -> {s['aliases_presentable']!r}")
    print(f"doomed {DOOMED_PID[:8]}...: DELETED")
    print(f"rows: {rows_before} -> {len(new_rows)} (-1); wrote {PT_OUT.name} + version-free")


if __name__ == "__main__":
    main()
