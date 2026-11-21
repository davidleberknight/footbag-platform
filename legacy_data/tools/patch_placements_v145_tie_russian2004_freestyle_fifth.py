#!/usr/bin/env python3
"""
patch_placements_v145_tie_russian2004_freestyle_fifth.py

Restores the four-way tie for 5th in Open Singles Freestyle at the Russian Open
Footbag Series, Stage 1, 2004 (event 1076876907), from its source page.

The page reads "5-8 Evgeniy "John" Kuharenko (Omsk) 10 / Ilkka Malin (Finland) /
Kirill Gurov (Kaluga) / Maxim "doctor" Erashov (Moscow)": four players sharing
5th. The lock kept only Kuharenko. A singles tie is several players at one place,
so all four are written at 5th and none is given a finish of its own.

Places 1 to 4 are kept as the lock has them, each by the id it already carries;
1st also gains its id, since the lock held him only as raw page text. Ilkka Malin
is the Finnish player of that exact name with an established record. Kirill Gurov
and Maxim Erashov are written unresolved, by the page's spelling: the two records
carrying a Gurov name hold the city read into it, which is a merge question, not
evidence to link by.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v145_tie_russian2004_freestyle_fifth.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

DIVISIONS = [
    Division("Open Singles Freestyle", "freestyle", "complete", (
        Player(1, "Jere Vainikka", "ce36ad7d-05ea-5a90-b194-e8683a75d97c"),
        Player(2, "Alexander Kermit Zamotin", "09fb3eb7-247a-5a41-8720-b4cc412e4beb"),
        Player(3, "Evgeni Kichigin", "56cebb12-f263-584e-ad0b-1b8fe05c4936"),
        Player(4, "Arkady Kemp Lobankov", "80696601-2e8f-54d7-8573-0e0d015bd5a9"),
        Player(5, "Kuharenko Evgeniy", "13272576-5e70-5828-89eb-5068ad59ace5"),
        Player(5, "Ilkka Malin", "5c0a3bfe-be36-5f21-9ce1-2700c8af27f3"),
        Player(5, "Kirill Gurov"),
        Player(5, "Maxim Erashov"),
    )),
]

if __name__ == "__main__":
    rebuild("1076876907", "2004", {"Open Singles Freestyle": 5}, DIVISIONS)
