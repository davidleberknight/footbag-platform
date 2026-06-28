#!/usr/bin/env python3
"""
patch_placements_v109_fix_polish2024_golf_ties.py

Restores two flattened score-ties in the frozen placements lock.

24th Polish Footbag Championships - Krakow 2024 (event 1727756195), Open Golf.
The published footbag.org result lists golf scores (lowest wins), which run
continuously across the podium divider, so it is one field ranked by score:

    Klimczak 15, Pietrzycki 16, Niczyporuk 16, Czech 17, Mosciszewski 17,
    Rog 18, Nowak 19, Ignaczak 20, Domin 21, Worek 25

Standard competition ranking of those scores ties 2nd (two players at 16) and
4th (two players at 17): 1, 2, 2, 4, 4, 6, 7, 8, 9, 10. The lock sequentialized
the field 1..10, flattening both ties. Eight rows already match the correct
ranking; only the two second-of-each-tie rows are wrong:

  - Maciej Niczyporuk  (score 16): place 3 -> 2  (ties Pietrzycki)
  - Kuba Mosciszewski  (score 17): place 5 -> 4  (ties Czech)

Each row is matched by (event_id, division_canon, person_id) with a current-
place and person_canon assertion, so no other row is touched and the row count
is unchanged. Output line endings are LF to match the tracked version-free file.

Expected v108 -> v109 diff (pre-verified):
  - 2 place edits (Niczyporuk 3->2, Mosciszewski 5->4) in Open Golf
  - total row count unchanged

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v109_fix_polish2024_golf_ties.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PB_IN = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v108.csv"
PB_OUT = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v109.csv"
PB_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"

EVENT_ID = "1727756195"
DIVISION = "Open Golf"

# (person_id, expected person_canon, old place, new place)
REMAPS = [
    ("401af1f3-a976-5403-9740-210e2849f159", "Maciej Niczyporuk", "3", "2"),
    ("7803c245-2181-5686-bd08-95d6d178974a", "Kuba Mosciszewski", "5", "4"),
]


def main() -> None:
    if not PB_IN.exists():
        print(f"ERROR: {PB_IN} not found", file=sys.stderr)
        sys.exit(1)

    with open(PB_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        rows = list(reader)

    n_in = len(rows)
    print(f"v108 input rows: {n_in}")

    remapped = 0
    for pid, canon, old_place, new_place in REMAPS:
        cand = [
            i
            for i, r in enumerate(rows)
            if r["event_id"] == EVENT_ID
            and r["division_canon"] == DIVISION
            and r["person_id"] == pid
        ]
        assert len(cand) == 1, f"expected 1 row for {canon} ({pid[:8]}), got {len(cand)}"
        i = cand[0]
        assert rows[i]["person_canon"] == canon, (
            f"person_canon drift at {pid[:8]}: {rows[i]['person_canon']!r}"
        )
        assert rows[i]["place"] == old_place, (
            f"place drift for {canon}: {rows[i]['place']!r} (expected {old_place})"
        )
        rows[i]["place"] = new_place
        remapped += 1
        print(f"  {canon}: place {old_place} -> {new_place}")

    assert remapped == len(REMAPS), f"expected {len(REMAPS)} remaps, got {remapped}"
    assert len(rows) == n_in, f"row count drift: {len(rows)} (expected {n_in})"

    with open(PB_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    shutil.copyfile(PB_OUT, PB_VERSION_FREE)

    print()
    print(f"Output: {PB_OUT}")
    print(f"        {PB_VERSION_FREE} (version-free latest, copied from v109)")
    print(f"  v108 rows: {n_in}  v109 rows: {len(rows)}  delta: 0 (place edits only)")


if __name__ == "__main__":
    main()
