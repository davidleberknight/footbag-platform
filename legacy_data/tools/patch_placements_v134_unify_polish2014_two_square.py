#!/usr/bin/env python3
"""
patch_placements_v134_unify_polish2014_two_square.py

Gives the 2-square contest of the 2014 Polish Championships (event 1406219099) one
division in the frozen placements lock.

The source page lists the 2-square standings twice, under "Open 2-Square:" and again
under "2square", with the same four players in the same order. The lock held both:
one copy named "Open 2-Square" and flagged sparse, so the platform export drops it,
and one named "Unknown", which ships under the key "unknown". The two copies of one
division fail the duplicate-spelling QC check. They become one "Open 2-Square"
division, filed as sideline, the category the shipped copy carries:

  Open 2-Square  1 Debski, 2 Ostrowski, 3 Gatesman, 4 Budzik

Each player keeps the id both copies already carried.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v134_unify_polish2014_two_square.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

DIVISIONS = [
    Division("Open 2-Square", "sideline", "complete", (
        Player(1, "Wiktor Debski", "c917c04b-83fa-5c1a-8f2c-292f24db5616"),
        Player(2, "Michal Ostrowski", "da3fbe76-ba2d-51ee-a019-97e7ba93089a"),
        Player(3, "Evan Gatesman", "be7a8e7f-f052-5c31-b27b-47d4fee9a265"),
        Player(4, "Damian Budzik", "a3781ac2-c529-5316-b22b-2bdcfa67bb67"),
    )),
]

if __name__ == "__main__":
    rebuild("1406219099", "2014", {"Open 2-Square": 4, "Unknown": 4}, DIVISIONS)
