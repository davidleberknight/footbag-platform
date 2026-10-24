#!/usr/bin/env python3
"""
patch_placements_v116_rebuild_todexon2013_sick_tricks.py

Rebuilds the two trick contests of Todexon 14 (2013, event 1357206898) from its
source page.

Each result line reads "Name (Country) - trick sequence". The lock paired every
competitor but one as a team with their trick ("Jindra Smola / Paradon
Swirl>mullet>steping torque", "Jan Weber / Atomic Ducking"). The page lists:
  Sick 3-Trick     1 Jan Weber, 2 Jindra Smola, 3 Alexander Trenner
  Open Sick Trick  1 Milan Benda, 2 Jan Weber, 3 Jindra Smola

Every competitor is named by the id the frozen rows carried, which the shared
alias resolver also returns. A further list on the page follows these without a
heading; it is not placed under either contest and is not touched.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v116_rebuild_todexon2013_sick_tricks.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

WEBER = "1e09ba09-ec4b-5961-8b95-e0d638dc4f5c"
SMOLA = "0c1d57ac-f8a6-5c3e-a66f-eac82c8a5df4"

DIVISIONS = [
    Division("Sick 3-Trick", "freestyle", "complete", (
        Player(1, "Jan Weber", WEBER),
        Player(2, "Jindrich Smola", SMOLA),
        Player(3, "Alexander Trenner", "24ffb4bb-a58e-54d8-b0d9-06b989c794cd"))),
    Division("Open Sick Trick", "freestyle", "complete", (
        Player(1, "Milan Benda", "0b3204c8-7e99-586e-aeb2-4186d0901fe3"),
        Player(2, "Jan Weber", WEBER),
        Player(3, "Jindrich Smola", SMOLA))),
]

if __name__ == "__main__":
    rebuild("1357206898", "2013", {"Open Sick 3-Trick": 3, "Open Sick Trick": 3}, DIVISIONS)
