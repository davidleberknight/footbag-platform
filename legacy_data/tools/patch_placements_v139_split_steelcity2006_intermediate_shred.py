#!/usr/bin/env python3
"""
patch_placements_v139_split_steelcity2006_intermediate_shred.py

Gives the 2006 Steel City Shred Off (event 1148241486) its Intermediate Shred 30
contest, from its source page.

The page lists "Intermediate Shred 30: (there was a tie for second)" as
"1) Danny Petrick", "2) Chris Miller", "2) Alex Verget". The lock has no such
division: those three rows were merged into "Open Rippin' Run", which held two
players at 1st and three at 2nd. The page's Open Rippin' Run is one player a
place: "1) David Clavens", "2) Gordon Bevier", "3) Jake Milofsky".

The rebuilt rows are the page's two lists:
  Open Rippin' Run        1 David Clavens, 2 Gordon Bevier, 3 Jake Milofsky
  Intermediate Shred 30   1 Danny Petrick, 2 Chris Miller, 2 Alex Verget

The tie at 2nd stays a tie: two player rows at one place, as the page has it.
Every player is named by the id the lock already carried for them in this event.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v139_split_steelcity2006_intermediate_shred.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

CLAVENS = "033a8589-0c98-5729-a8b4-068c4efcf025"
BEVIER = "10573dc4-31ee-5440-9df4-a68d11bd4801"
MILOFSKY = "0f51c65d-c889-5354-8cb7-21bef31c04ca"
PETRICK = "bd9a2c9a-1554-5238-929d-c876342007a3"
MILLER = "d53d0dae-9c1e-5773-a133-e42829b7a2ae"
VERGET = "448d4c37-75f4-5396-bd2f-544dd0ab967c"

DIVISIONS = [
    Division("Open Rippin' Run", "freestyle", "complete", (
        Player(1, "David Clavens", CLAVENS),
        Player(2, "Gordon Bevier", BEVIER),
        Player(3, "Jake Milofsky", MILOFSKY),
    )),
    Division("Intermediate Shred 30", "freestyle", "complete", (
        Player(1, "Danny Petrick", PETRICK),
        Player(2, "Chris Miller", MILLER),
        Player(2, "Alex Verget", VERGET),
    )),
]

if __name__ == "__main__":
    rebuild("1148241486", "2006", {"Open Rippin' Run": 6}, DIVISIONS)
