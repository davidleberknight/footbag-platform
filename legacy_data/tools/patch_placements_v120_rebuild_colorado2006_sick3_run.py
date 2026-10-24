#!/usr/bin/env python3
"""
patch_placements_v120_rebuild_colorado2006_sick3_run.py

Rebuilds the Open Sick 3 and Most Rippin' Run divisions of the 7th Annual
Colorado Shred Symposium (2006, event 1137347261) from its source page.

The lock held Most Rippin' Run under a trick line read as its heading ("Double
Spinning Clipper>Scorpions Tail>Whirlwind"), merged with Open Sick 3's
competitors, and held Open Sick 3 with one competitor at both second and third.
The page gives:
  Open Sick 3      1 Lon Smith, 2 Evan Gatesman, 3 Justin Dale,
                   4 Ken Somolinos, 5 Daryl Genz
  Most Rippin' Run 1 David Clavens, 2 Justin Dale

Every competitor is named by the id the lock already carried for them in this
event; the page's "Lon Smith" is the record the lock names Skyler Lon Smith for
this place and for the event's Last Man Standing.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v120_rebuild_colorado2006_sick3_run.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

DALE = "91dbdc03-080b-5170-a2b4-6fcbc7b4f053"

DIVISIONS = [
    Division("Open Sick 3", "freestyle", "complete", (
        Player(1, "Skyler Lon Smith", "11d216c3-891d-5728-981f-dc20ba381dd9"),
        Player(2, "Evan Gatesman", "be7a8e7f-f052-5c31-b27b-47d4fee9a265"),
        Player(3, "Justin Dale", DALE),
        Player(4, "Ken Somolinos", "d1aace44-cd92-5b85-9ed1-fe4afb2cd502"),
        Player(5, "Daryl Genz", "bd97ebe2-5ecd-5854-9d2e-b877a27ac527"))),
    Division("Most Rippin' Run", "freestyle", "complete", (
        Player(1, "David Clavens", "033a8589-0c98-5729-a8b4-068c4efcf025"),
        Player(2, "Justin Dale", DALE))),
]

if __name__ == "__main__":
    rebuild("1137347261", "2006",
            {"Double Spinning Clipper>Scorpions Tail>Whirlwind": 6, "Open Sick 3": 6}, DIVISIONS)
