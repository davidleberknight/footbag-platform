#!/usr/bin/env python3
"""
patch_placements_v113_split_newyears2006_novice_age_groups.py

Restores the Novice Consecutives age-group winners of New Years 2006 (event
1157942368) in the frozen placements lock.

The source lists one winner per age group under the division header:

    Novice Consecutives
    Teen:         Cody Smith (88)
    Youth Boys:   Alex Davidson (5)
    Youth Girls:  Juliana Kopecka (3)

The lock carried one row, place 1 with the competitor named "Teen": the age
label read as a name, the Teen winner dropped, and the two youth winners lost.

This patch replaces that row with three rows, one first place per age group,
each under its own sub-division ("Novice Consecutives - Teen" and so on), the
names the parser now gives them. All three are left unresolved (person_id
blank): a name matching an existing record is not an identity ruling, so this
patch asserts none.

Match is keyed by the exact line, so it cannot touch any other row. Every other
line is copied through byte for byte. A second run stops on its pre-condition
check; checking out the file is the rollback.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v113_split_newyears2006_novice_age_groups.py
"""

from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PBP = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"

OLD_LINE = "1157942368,2006,Novice Consecutives,sideline,1,player,,,Teen,,complete,True,teen,"
WINNERS = [("Teen", "Cody Smith"), ("Youth Boys", "Alex Davidson"), ("Youth Girls", "Juliana Kopecka")]


def _emit(row: list[str]) -> str:
    buf = io.StringIO()
    csv.writer(buf, lineterminator="").writerow(row)
    return buf.getvalue()


def main() -> None:
    if not PBP.exists():
        print(f"ERROR: {PBP} not found", file=sys.stderr)
        sys.exit(1)
    raw = PBP.read_bytes().decode("utf-8")
    if "\r\n" in raw:
        raise AssertionError(f"{PBP.name}: expected LF line endings")
    lines = raw.split("\n")
    header = next(csv.reader([lines[0]]))
    hits = [i for i, ln in enumerate(lines) if ln == OLD_LINE]
    if len(hits) != 1:
        raise AssertionError(f"expected the one 'Teen' row, found {len(hits)} (already applied?)")

    new_lines = []
    for label, name in WINNERS:
        row = {h: "" for h in header}
        row.update(event_id="1157942368", year="2006",
                   division_canon=f"Novice Consecutives - {label}", division_category="sideline",
                   place="1", competitor_type="player", person_canon=name,
                   coverage_flag="complete", person_unresolved="1", norm=name.lower(),
                   division_raw="Novice Consecutives")
        new_lines.append(_emit([row[h] for h in header]))
    lines[hits[0]:hits[0] + 1] = new_lines

    PBP.write_text("\n".join(lines), encoding="utf-8")
    print(f"{PBP.relative_to(ROOT)}: 1 row replaced by {len(new_lines)}")


if __name__ == "__main__":
    main()
