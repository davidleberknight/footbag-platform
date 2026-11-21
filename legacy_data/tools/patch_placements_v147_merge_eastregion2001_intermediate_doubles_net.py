#!/usr/bin/env python3
"""
patch_placements_v147_merge_eastregion2001_intermediate_doubles_net.py

Rejoins Intermediate Doubles Net at the East Coast Footbag Championships 2001
(event 981129410), from its source page.

The page gives the contest one list under "Intermediate Doubles Net Results (one
pool with novice teams)":
  1. Chuck Donnely & Jeremy Walters, 2. Ted Fritsch & Jack Lentz,
  3. Ann Lasken & Amy Noller.
The lock stored 1st under "Intermediate Doubles Net Results" and 2nd and 3rd
under "Intermediate Doubles Net". The rebuilt rows are the page's list under
"Intermediate Doubles Net", the name the event's other contests take without the
"Results" suffix; the suffixed division is removed.

Teams are team rows, named by each member's canon, which the export resolves
member by member.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v147_merge_eastregion2001_intermediate_doubles_net.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Team, rebuild  # noqa: E402

DIVISIONS = [
    Division("Intermediate Doubles Net", "net", "complete", (
        Team(1, ("Chuck Donnelly", "Jeremy Walters")),
        Team(2, ("Theodore Fritsch", "Jack Lentz")),
        Team(3, ("Ann Lasken", "Amy Noller")),
    )),
]

if __name__ == "__main__":
    rebuild("981129410", "2001",
            {"Intermediate Doubles Net": 2, "Intermediate Doubles Net Results": 1},
            DIVISIONS)
