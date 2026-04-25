#!/usr/bin/env python3
"""
patch_pt_v62_remove_manu_bouchard_stub.py

Drops the "Manu Bouchard" stub (f1e2640c-48ae-588d-99bc-7b55713191f0)
after community-confirmed alias merge with Emmanuel Bouchard
(3ef63282-9e9c-5f57-94c5-e1b5c4fe8c3c, US, HoF, 1985-2025, 174 placements).

Manu is the French-Canadian nickname for Emmanuel; both forms refer to
the same player. Confirmed by user 2026-04-25; alias row already added
to overrides/person_aliases.csv routing 'Manu Bouchard' → Emmanuel pid.

After the alias merge, all 12 of Manu's placements re-attribute to
Emmanuel via the alias resolver. The PT stub for f1e2640c persisted as
an orphan in out/canonical/persons.csv because PT rebuilds person rows
from the lock; this patch removes the stub so the orphan clears.

Does not mutate v61. Produces v62 with 4091 rows (was 4092).

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v62_remove_manu_bouchard_stub.py
"""

from __future__ import annotations

import csv
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT_IN  = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v61.csv"
PT_OUT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v62.csv"

DOOMED_PID = "f1e2640c-48ae-588d-99bc-7b55713191f0"  # Manu Bouchard stub

_TRANSLITERATE = str.maketrans("łŁøØđĐðÞŋ", "lLoOdDdTn")


def _norm_for_sort(s: str) -> str:
    s = (s or "").replace("�", "").replace("­", "")
    s = s.translate(_TRANSLITERATE)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower().strip())


def main() -> None:
    if not PT_IN.exists():
        print(f"ERROR: {PT_IN} not found", file=sys.stderr); sys.exit(1)

    with open(PT_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        rows = list(reader)

    doomed = next((r for r in rows if r["effective_person_id"] == DOOMED_PID), None)
    if doomed is None:
        print(f"ERROR: doomed pid {DOOMED_PID} not found in v61", file=sys.stderr)
        sys.exit(2)

    print(f"v61 input rows: {len(rows)}")
    print(f"  dropping stub: {doomed['effective_person_id']}  '{doomed['person_canon']}'")

    out_rows = [r for r in rows if r["effective_person_id"] != DOOMED_PID]
    assert len(out_rows) == len(rows) - 1

    out_rows.sort(key=lambda r: _norm_for_sort(r.get("person_canon", "")))

    with open(PT_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(out_rows)

    print(f"\nOutput: {PT_OUT}")
    print(f"  v61 rows: {len(rows)}  v62 rows: {len(out_rows)}  delta: -1")


if __name__ == "__main__":
    main()
