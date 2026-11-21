#!/usr/bin/env python3
"""
patch_placements_v142_split_kicktilsick2003_sick3.py

Gives the "Kick Til You're Sick" Fall Freestyle Fest 2003 (event 1058877971) its
Open Sick 3 contest, from its source page.

The page lists "Shred 30 ... Open: 1st Place- Jonathan Schneider, 2nd Place- Josh
Benham, 3rd Place- Matt Cross" and "Sick 3 Open: 1st Place- Kenny Schults, 2nd
Place- Jonathan Schneider, 3rd Place- Chris Kovacs". The lock merged the two
lists by place into one division, "Open", two players a place.

The rebuilt rows are the page's two lists:
  Open          1 Jonathan Schneider, 2 Josh Benham, 3 Matt Cross
  Open Sick 3   1 Kenny Shults, 2 Jonathan Schneider, 3 Chris Kovacs

"Open" keeps its name, so the discipline fix that renames it "Open Shred 30"
still applies. The page's "Kenny Schults" is the record the lock already carried
at this place, whose canon is Kenny Shults. Every player is named by the id the
lock already carried for them in this event.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v142_split_kicktilsick2003_sick3.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

SCHNEIDER = "2c16c43d-6111-5231-b813-23f20f6ba7a3"

DIVISIONS = [
    Division("Open", "freestyle", "complete", (
        Player(1, "Jonathan Schneider", SCHNEIDER),
        Player(2, "Josh Benham", "ffa33e63-f63b-5a7b-ab85-1b6f65151734"),
        Player(3, "Matt Cross", "bc7525cb-8eb2-5cf2-a11e-1b072fede923"),
    )),
    Division("Open Sick 3", "freestyle", "complete", (
        Player(1, "Kenny Shults", "2a6a7c9e-1d8a-4f9a-a8f5-6f3a3c1e9b0f"),
        Player(2, "Jonathan Schneider", SCHNEIDER),
        Player(3, "Chris Kovacs", "6469ade8-02a6-5a6f-8b42-c277458d05d7"),
    )),
]

if __name__ == "__main__":
    rebuild("1058877971", "2003", {"Open": 6}, DIVISIONS)
