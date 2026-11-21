#!/usr/bin/env python3
"""
patch_placements_v154_rebuild_windycity2010_doubles.py

Rebuilds Doubles at the 3rd Annual Windy City Cup 2010 (event 1267718326) from
its source page.

The page lists nine doubles teams, headed by "1. Emmanuel Bouchard and PT Lovern
(2 years in a row!)". The lock had lost that team, and had filed the page's four
intermediates players (Ben Appold, Steve Richardson, Ronnie Rodriguez, Mark
Zimmerman) under Doubles as players at places 1 to 4, so the export paired Ben
Appold with an empty slot as the winners. Those four keep their own rows in the
event's intermediates list, which this patch leaves as it is.

Every team is a team row, which the export resolves member by member; "PT Lovern"
is a verified alias of P.T. Lovern.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v154_rebuild_windycity2010_doubles.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Team, rebuild  # noqa: E402

DIVISIONS = [
    Division("Doubles", "net", "complete", (
        Team(1, ("Emmanuel Bouchard", "PT Lovern")),
        Team(2, ("Patrick Schrickel", "Eric Wulff")),
        Team(3, ("Jack Harris", "Jeremy Mirken")),
        Team(4, ("Cory Current", "Scot Hansen")),
        Team(5, ("Ben Alston", "Walt Houston")),
        Team(6, ("Greg Grandy", "Ted Martin")),
        Team(7, ("Bryan Nelson", "Tommy Whitworth")),
        Team(8, ("Fletcher Funk", "Jim Hankins")),
        Team(9, ("Mikey Bellman", "Zeke Ibardaloza")),
    )),
]

if __name__ == "__main__":
    rebuild("1267718326", "2010", {"Doubles": 12}, DIVISIONS)
