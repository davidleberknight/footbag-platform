#!/usr/bin/env python3
"""
patch_placements_v118_rebuild_montana2007_shred30.py

Rebuilds the two Shred30 divisions of Montana Footbag Jam 2007 (event
1173467292) from its source page.

The page lists Shred30, Rippin Run, Sick Trick and Sick3, each split into
"Intermediate:" and "Open:". The lock holds only the Shred30 lists, under the bare
names "Intermediate" and "Open", and each had taken in one row from a later
contest's list of the same name, paired with that competitor's trick line:
"Zeb Jackson / Blurry Whirl" at Intermediate 4 and "Daryl Genz / Blurry
Whirl>Pdx Torque>Pdx Mirage" at Open 3. Both competitors already hold their own
Shred30 places (Intermediate 1 and Open 6).

The rebuilt rows are the Shred30 lists as the page gives them, each competitor
named by the id the lock already carried for that place:
  Intermediate  1 Zeb Jackson .. 6 Ben Benulis
  Open          1 Jim Penske .. 8 Luis Monhollon

The other contests the page lists are not in the lock; recovering them is
separate work.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v118_rebuild_montana2007_shred30.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

DIVISIONS = [
    Division("Intermediate", "freestyle", "complete", (
        Player(1, "Zeb Jackson", "348ea683-38f2-54ab-ad04-db29a37bb687"),
        Player(2, "Jake Wren", "67f14498-b4d7-54f4-ad8a-3a4d95ccbd24"),
        Player(3, "Kyle Hewitt", "9f9142e1-95ac-511a-b996-7873698c7818"),
        Player(4, "Zac Jackson", "8fc44a4b-aa33-5106-8cc6-8f2303bf1b0e"),
        Player(5, "Scott Behmer", "666a999f-ca5c-5d15-97f4-27abeb8ac5af"),
        Player(6, "Ben Benulis", "0f04687b-1e6c-597f-be61-6edb9e8e6bfa"))),
    Division("Open", "freestyle", "complete", (
        Player(1, "Jim Penske", "4d04edec-6cd0-582d-b4e1-e8ead070a8c8"),
        Player(2, "Andrew Grant", "8606f658-92cd-570c-bf5e-2865de4a9b48"),
        Player(3, "Byrin Wylie", "bf5ce745-18b5-50b5-87a5-b2af6ffbf21c"),
        Player(4, "Nick Landes", "48268322-19d9-5180-aac2-241293167d21"),
        Player(5, "Rory Dawson", "e53e759e-e2e1-589b-a5b2-4c95e89b8e8c"),
        Player(6, "Daryl Genz", "bd97ebe2-5ecd-5854-9d2e-b877a27ac527"),
        Player(7, "Kevin Regamey", "6c912402-7d0e-580d-938c-7c6542c48bb1"),
        Player(8, "Luis Monhollon", "23c6748c-39f8-5ecd-ae9c-c3d83c0bfec6"))),
]

if __name__ == "__main__":
    rebuild("1173467292", "2007", {"Intermediate": 7, "Open": 9}, DIVISIONS)
