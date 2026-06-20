#!/usr/bin/env python3
"""
patch_placements_v107_merge_nycz.py

Companion to patch_pt_v69_merge_nycz.py. Re-attributes every placement of the
doomed pid `07f95465-470d-502b-804d-643380e1385c` ('Gosia Nycz') to the survivor
`e6f5c3f9-b642-52a2-a6b4-9d8037fa5a83` ('Małgorzata Nycz'), and repairs the
survivor's own singles rows whose person_canon still held the broken
'Ma gorzata Nycz' mojibake.

  Block A  doomed singles (competitor_type='player', person_id == doomed):
           person_id -> survivor, person_canon 'Gosia Nycz' -> 'Małgorzata Nycz'.
           norm is left as-is (it captures the original source form).
  Block B  doomed doubles (competitor_type='team', doomed in team_person_key):
           replace the doomed pid with the survivor pid inside team_person_key.
  Block C  survivor singles whose person_canon == 'Ma gorzata Nycz':
           person_canon -> 'Małgorzata Nycz' (mojibake repair only).

Row count is unchanged. After the patch no row references the doomed pid in
person_id or team_person_key.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v107_merge_nycz.py
"""
from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PB_IN = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v106.csv"
PB_OUT = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v107.csv"
PB_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"

SURVIVOR_PID = "e6f5c3f9-b642-52a2-a6b4-9d8037fa5a83"
DOOMED_PID = "07f95465-470d-502b-804d-643380e1385c"
CANON = "Małgorzata Nycz"
MOJIBAKE_CANON = "Ma gorzata Nycz"


def main() -> None:
    if not PB_IN.exists():
        print(f"ERROR: {PB_IN} not found", file=sys.stderr); sys.exit(1)

    with open(PB_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        rows = list(reader)
    original = [dict(r) for r in rows]
    rows_before = len(rows)
    print(f"v106 input rows: {rows_before}")

    a = b = c = d = 0
    touched: set[int] = set()
    for i, r in enumerate(rows):
        if r["competitor_type"] == "player" and r["person_id"] == DOOMED_PID:
            assert r["person_canon"] == "Gosia Nycz", f"row {i}: canon {r['person_canon']!r}"
            r["person_id"] = SURVIVOR_PID
            r["person_canon"] = CANON
            a += 1; touched.add(i)
        elif r["competitor_type"] == "team" and DOOMED_PID in (r["team_person_key"] or "").split("|"):
            r["team_person_key"] = "|".join(
                SURVIVOR_PID if k == DOOMED_PID else k
                for k in r["team_person_key"].split("|")
            )
            b += 1; touched.add(i)
        elif r["competitor_type"] == "player" and r["person_id"] == SURVIVOR_PID \
                and r["person_canon"] == MOJIBAKE_CANON:
            r["person_canon"] = CANON
            c += 1; touched.add(i)
        elif r["competitor_type"] == "team" and SURVIVOR_PID in (r["team_person_key"] or "").split("|") \
                and MOJIBAKE_CANON in (r["team_display_name"] or ""):
            r["team_display_name"] = r["team_display_name"].replace(MOJIBAKE_CANON, CANON)
            d += 1; touched.add(i)

    print(f"Block A singles flipped: {a}")
    print(f"Block B team-keys re-pointed: {b}")
    print(f"Block C survivor mojibake canon repaired: {c}")
    print(f"Block D survivor team-display mojibake repaired: {d}")

    # Post-conditions
    assert a == 12, f"expected 12 doomed singles, got {a}"
    assert b == 14, f"expected 14 doomed team rows, got {b}"
    assert c == 3, f"expected 3 survivor mojibake singles, got {c}"
    assert d == 1, f"expected 1 survivor team-display mojibake, got {d}"
    assert len(rows) == rows_before, "row count drift"
    assert not any(r["person_id"] == DOOMED_PID for r in rows), "doomed person_id remains"
    assert not any(DOOMED_PID in (r["team_person_key"] or "").split("|") for r in rows), \
        "doomed pid remains in a team_person_key"
    assert not any(r["person_canon"] == MOJIBAKE_CANON for r in rows), "mojibake canon remains"
    assert not any(MOJIBAKE_CANON in (r["team_display_name"] or "") for r in rows), \
        "Nycz mojibake remains in a team_display_name"
    # Nothing outside the touched set changed.
    for i, (o, n) in enumerate(zip(original, rows)):
        if i not in touched:
            assert o == n, f"unintended mutation at row {i}"

    with open(PB_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    shutil.copyfile(PB_OUT, PB_VERSION_FREE)
    print(f"rows: {rows_before} (unchanged); wrote {PB_OUT.name} + version-free")


if __name__ == "__main__":
    main()
