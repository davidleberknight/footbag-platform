#!/usr/bin/env python3
"""
patch_placements_v151_merge_swiss2012_open_circle.py

Rejoins Open Circle at the Swiss Footbag Championships 2012 (event 1329132977),
from its source page.

The page's results list reads "Open Circle Contest: 1. Milan Benda, 2. Jindra
Smola, 3. Rene Rühr, 4. Jeff Mudd, 5. Rafal Kaleta, 6. Pawel Rozek"; its manually
entered copy, "Open Circle", gives 1st to 4th. The lock kept 1st to 4th under
"Open Circle" and only 6th under "Open Circle Contest". The rebuilt rows are the
full list under "Open Circle"; the other division is removed.

Every player is named by the id the lock already carries for that player in this
event, under the canon of that record.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v151_merge_swiss2012_open_circle.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

DIVISIONS = [
    Division("Open Circle", "freestyle", "complete", (
        Player(1, "Milan Benda", "0b3204c8-7e99-586e-aeb2-4186d0901fe3"),
        Player(2, "Jindrich Smola", "0c1d57ac-f8a6-5c3e-a66f-eac82c8a5df4"),
        Player(3, "Rene Ruehr", "9585ffd8-cc96-528e-ba4a-4211da8cef00"),
        Player(4, "Jeff Mudd", "c5b1d0d2-8be2-5b4d-8665-7e93fadd24b0"),
        Player(5, "Rafal Kaleta", "82c36f56-236f-4496-826b-cf59a6fcc4ed"),
        Player(6, "Pawel Rozek", "0b3ffb10-2257-510e-a69a-26ff2fc87508"),
    )),
]

if __name__ == "__main__":
    rebuild("1329132977", "2012",
            {"Open Circle": 4, "Open Circle Contest": 1}, DIVISIONS)
