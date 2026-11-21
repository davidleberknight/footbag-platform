#!/usr/bin/env python3
"""
patch_placements_v153_rebuild_polish2014_open_circle.py

Restores Open Circle Contest at the 14th Annual Polish Footbag Championships 2014
(event 1406219099), from its source page.

The page's results list reads "Open Circle Contest: 1. Evan Gatesman, 2. Marcin
Bujko, 3. Filip Wójcik, 4. Mariusz Wilk". The lock kept only 1st and 4th; 2nd and
3rd were read into the page's Polish top-3 copy, "Circle Contest", which a
quarantine rule removes and this patch leaves as it is.

Every player is named by the id the lock already carries for that player in this
event, under the canon of that record.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v153_rebuild_polish2014_open_circle.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

DIVISIONS = [
    Division("Open Circle Contest", "freestyle", "complete", (
        Player(1, "Evan Gatesman", "be7a8e7f-f052-5c31-b27b-47d4fee9a265"),
        Player(2, "Marcin Bujko", "4f0fcdbc-8dfe-51fc-b92c-b3cda4dd0c00"),
        Player(3, "Filip Wojcik", "6d948954-90cb-5446-9a60-9d4ca0ef4734"),
        Player(4, "Mariusz Wilk", "4ad82639-801d-5c4b-aae6-f07e5dfe67d2"),
    )),
]

if __name__ == "__main__":
    rebuild("1406219099", "2014", {"Open Circle Contest": 2}, DIVISIONS)
