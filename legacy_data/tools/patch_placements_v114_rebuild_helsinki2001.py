#!/usr/bin/env python3
"""
patch_placements_v114_rebuild_helsinki2001.py

Rebuilds the frozen placements of Footbag Jam Helsinki 2001 (event 1005667143)
from its source page.

Every result line on the page reads "Name, Town, Country - trick". The lock held
the parser's misreading of all five divisions: each competitor paired as a team
with their trick ("Janne Pesonen / Legbeater -> Vortex") or their town ("Lasse
Salmenhaara / Helsinki"), and the Open Huge Combo winner missing, dropped because
the trick line ended "!!!!!".

The rebuilt rows, from the source text, one player per place:
  Intermediate Big Trick  1 Raitio, 2 Aarnio, 3 Ahlfors
  Intermediate Shred      1 Ahlfors, 2 Raitio, 3 Oun
  Open Ironman            1 Vainikka
  Open Huge Combo         1 Salmenhaara, 2 Pesonen, 3 Linnanen
  Open Shred              1 Vainikka, 2 Salmenhaara, 3 Malin

Each competitor is named by the id the shared alias resolver returns for them;
five of those ids are the ones the frozen team rows already carried.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v114_rebuild_helsinki2001.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

RAITIO = "7a8ebf46-3df4-5114-9913-7154c9e52708"
AARNIO = "5e7aee36-aee8-5e0f-8ba5-3e955de284f3"
AHLFORS = "07d6a45a-d9ce-5003-a788-a09bc63a4cd6"
OUN = "8f70359a-04de-593d-ae34-6fb799a6c247"
VAINIKKA = "ce36ad7d-05ea-5a90-b194-e8683a75d97c"
SALMENHAARA = "ee569024-9b98-5ae0-8f39-8f0a97d99dfa"
PESONEN = "0f6326d1-3099-5489-b003-2e4b9d876292"
LINNANEN = "fc3f381a-650e-5582-910d-6a83702e9dae"
MALIN = "5c0a3bfe-be36-5f21-9ce1-2700c8af27f3"

DIVISIONS = [
    Division("Intermediate Big Trick", "freestyle", "complete", (
        Player(1, "Pekka Raitio", RAITIO),
        Player(2, "Timo Aarnio", AARNIO),
        Player(3, "Teemu Ahlfors", AHLFORS))),
    Division("Intermediate Shred", "freestyle", "complete", (
        Player(1, "Teemu Ahlfors", AHLFORS),
        Player(2, "Pekka Raitio", RAITIO),
        Player(3, "Reimo Oun", OUN))),
    Division("Open Ironman", "freestyle", "complete", (
        Player(1, "Jere Vainikka", VAINIKKA),)),
    Division("Open Huge Combo", "freestyle", "complete", (
        Player(1, "Lasse Salmenhaara", SALMENHAARA),
        Player(2, "Janne Pesonen", PESONEN),
        Player(3, "Jere Linnanen", LINNANEN))),
    Division("Open Shred", "freestyle", "complete", (
        Player(1, "Jere Vainikka", VAINIKKA),
        Player(2, "Lasse Salmenhaara", SALMENHAARA),
        Player(3, "Ilkka Malin", MALIN))),
]

if __name__ == "__main__":
    rebuild("1005667143", "2001",
            {"Intermediate Big Trick": 3, "Intermediate Shred": 3, "Open Ironman": 1,
             "Open Huge Combo": 2, "Open Shred": 3},
            DIVISIONS)
