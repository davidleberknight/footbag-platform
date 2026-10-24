#!/usr/bin/env python3
"""
patch_placements_v132_rebuild_socali2008.py

Rebuilds SoCali Jam 08 (event 1200725314) from the final standings on its source page.

The page lists three contests, Big 3, Big 1 and Rippin Run. The lock had merged all
three into one "Open Singles Freestyle" division, so players held up to three places
in it. Each contest is carried as its own division.

Competitors are named by the id the lock already carried for them in this event.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v132_rebuild_socali2008.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

ID = {
    "Evan Gatesman": "be7a8e7f-f052-5c31-b27b-47d4fee9a265",
    "Ben Skaggs": "f825bd42-5056-55c5-8a4c-ba0788615e01",
    "Dustin Rhodes": "58bb3c4a-1a60-537d-ba4e-55de294abd8c",
    "Peter Holoien": "416e8b3a-f738-5d7f-8e22-89a74a41e538",
    "Scott Behmer": "666a999f-ca5c-5d15-97f4-27abeb8ac5af",
}


def ranked(*names):
    return tuple(Player(i, n, ID[n]) for i, n in enumerate(names, 1))


DIVISIONS = [
    Division("Big 3", "freestyle", "complete", ranked("Evan Gatesman", "Ben Skaggs", "Dustin Rhodes")),
    Division("Big 1", "freestyle", "complete", ranked("Evan Gatesman", "Ben Skaggs", "Peter Holoien")),
    Division("Rippin Run", "freestyle", "complete",
             ranked("Evan Gatesman", "Scott Behmer", "Ben Skaggs", "Dustin Rhodes")),
]

if __name__ == "__main__":
    rebuild("1200725314", "2008", {"Open Singles Freestyle": 10}, DIVISIONS)
