#!/usr/bin/env python3
"""
patch_placements_v108_split_rnh2006_mini_net.py

Restores a flattened tie in the frozen placements lock.

RNH Contest 2006 (event 1134914723), Mini Net. The published footbag.org
result is:

    1. Franck Remy
    2. Lino Landau
    3. Gerg Lima / Grischa Tellenbach

Places 1 and 2 are single players, so the slashed third place is a tie
between two singles, not a doubles team. The lock collapsed it into a single
"team" / __NON_PERSON__ row at place 3, losing the tie and one competitor.

This patch replaces that one team row with two tied player rows at place 3:

  - Gerg Lima        — left unresolved (person_id blank), matching the
                       existing resolution state. "Gerg Lima" is not a
                       resolved person anywhere in the lock (its team-key
                       component d4002cc4 appears only inside this team key
                       and in no persons master), so this patch does NOT
                       assert a "Gerg Lima" = "Greg Lima" identity merge;
                       that is a separate upstream alias decision.
  - Grischa Tellenbach — person_id ec1d5118 (already the resolved component
                       of the original team key; 123 other placements).

Match is keyed by (event_id, division_canon, place, competitor_type) AND the
exact team_person_key, with a team_display_name assertion, so it cannot touch
any other row. Output line endings are LF to match the tracked version-free
file.

Expected v107 -> v108 diff (pre-verified):
  - 1 team row removed at (1134914723, 'Mini Net', 3)
  - 2 player rows added at the same place (Gerg Lima unresolved; Grischa
    Tellenbach ec1d5118), both place 3 (a tie)
  - total row count 27,970 -> 27,971 (+1)

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v108_split_rnh2006_mini_net.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PB_IN = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v107.csv"
PB_OUT = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson_v108.csv"
PB_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"

EVENT_ID = "1134914723"
DIVISION = "Mini Net"
PLACE = "3"
TEAM_KEY = "d4002cc4-45c2-58fd-b2f1-255491cf1c95|ec1d5118-cd4b-591f-a84a-04bbe20868bc"
TEAM_DISPLAY = "Gerg Lima / Grischa Tellenbach"
GRISCHA_PID = "ec1d5118-cd4b-591f-a84a-04bbe20868bc"


def _row(fieldnames: list[str], **vals: str) -> dict:
    row = {fn: "" for fn in fieldnames}
    row.update(vals)
    missing = set(vals) - set(fieldnames)
    assert not missing, f"unknown fields for this lock schema: {missing}"
    return row


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
    print(f"v107 input rows: {n_in}")

    target_idx = [
        i
        for i, r in enumerate(rows)
        if r["event_id"] == EVENT_ID
        and r["division_canon"] == DIVISION
        and r["place"] == PLACE
        and r["competitor_type"] == "team"
        and r["team_person_key"] == TEAM_KEY
    ]
    assert len(target_idx) == 1, f"expected exactly 1 target team row, got {len(target_idx)}"
    idx = target_idx[0]
    assert rows[idx]["team_display_name"] == TEAM_DISPLAY, (
        f"team_display_name drift: {rows[idx]['team_display_name']!r}"
    )

    gerg = _row(
        fieldnames,
        event_id=EVENT_ID, year="2006", division_canon=DIVISION,
        division_category="net", place=PLACE, competitor_type="player",
        person_id="", team_person_key="", person_canon="Gerg Lima",
        team_display_name="", coverage_flag="unresolved",
        person_unresolved="1", norm="gerg lima", division_raw="",
    )
    grischa = _row(
        fieldnames,
        event_id=EVENT_ID, year="2006", division_canon=DIVISION,
        division_category="net", place=PLACE, competitor_type="player",
        person_id=GRISCHA_PID, team_person_key="", person_canon="Grischa Tellenbach",
        team_display_name="", coverage_flag="complete",
        person_unresolved="", norm="grischa tellenbach", division_raw="",
    )

    rows[idx:idx + 1] = [gerg, grischa]

    assert len(rows) == n_in + 1, f"row count drift: {len(rows)} (expected {n_in + 1})"

    with open(PB_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    shutil.copyfile(PB_OUT, PB_VERSION_FREE)

    print()
    print(f"Split applied at ({EVENT_ID}, {DIVISION!r}, place {PLACE}):")
    print(f"  removed team row: {TEAM_DISPLAY!r}")
    print("  added player rows (tied 3rd): 'Gerg Lima' (unresolved), "
          f"'Grischa Tellenbach' ({GRISCHA_PID[:8]}...)")
    print()
    print(f"Output: {PB_OUT}")
    print(f"        {PB_VERSION_FREE} (version-free latest, copied from v108)")
    print(f"  v107 rows: {n_in}  v108 rows: {len(rows)}  delta: +1")


if __name__ == "__main__":
    main()
