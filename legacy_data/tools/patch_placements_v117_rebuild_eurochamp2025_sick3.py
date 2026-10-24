#!/usr/bin/env python3
"""
patch_placements_v117_rebuild_eurochamp2025_sick3.py

Rebuilds the Sick 3 division of the 2025 European Championships, Frankfurt
(event 1740391168), from its source page.

Each result reads "Name (Country) - trick sequence", the sequence running onto
the next lines. The lock paired four competitors as a team with the first words
of their trick line ("Andy Nawrath / Mobius >", "Marco Hartig (DE) / Reverse").
The page lists:
  1 Christopher Schillem, 2 Rafal Kaleta, 3 Pawel Nowak, 4 Andy Nawrath,
  5 Marco Hartig, 6 Mikko Lepisto

Every competitor is named by the id the frozen rows carried. Places 1 and 3 were
already correct player rows; the shared alias resolver returns the same ids for
the other four.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v117_rebuild_eurochamp2025_sick3.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

DIVISIONS = [
    Division("Sick 3", "freestyle", "complete", (
        Player(1, "Christopher Schillem", "c29c4aa7-5b1e-54d1-9435-2a45edfd669c"),
        Player(2, "Rafal Kaleta", "82c36f56-236f-4496-826b-cf59a6fcc4ed"),
        Player(3, "Pawel Nowak", "9fccb3a3-3408-518a-aacb-43d9678fcce4"),
        Player(4, "Andy Nawrath", "17a27155-b5bc-5c72-ac90-602127a1ed24"),
        Player(5, "Marco Hartig", "05e1eec0-b3f1-5728-8ad2-831de4fc204f"),
        Player(6, "Mikko Lepisto", "8e2c07e2-aeb8-5325-be31-ffcc452944ec"))),
]

if __name__ == "__main__":
    rebuild("1740391168", "2025", {"Sick 3": 6}, DIVISIONS)
