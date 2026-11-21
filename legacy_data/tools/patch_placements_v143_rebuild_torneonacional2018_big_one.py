#!/usr/bin/env python3
"""
patch_placements_v143_rebuild_torneonacional2018_big_one.py

Rebuilds the Big One contest of the 2o Torneo Nacional de Footbag 2018 (event
1537994275) from its source page.

The page lists "Big One Resultados: 1er LUGAR ANTONIO LINERO / BLURRY WHIRL,
2° LUGAR CARLOS RAMIREZ / DOBLE LEG OVER, 3er LUGAR JUAN BERNARDO PALACIOS /
LEG OVER." The 2nd-place trick name was read as the division heading, so the
lock calls the division "Doble Leg Over", holds a placeholder at 1st and has no
2nd place.

The rebuilt rows are the page's list:
  1 Antonio Linero Castro, 2 Carlos Ramirez, 3 Juan Bernardo Palacios Lemos

The division keeps its name, so the discipline fix that renames it "Big One"
still applies. Every player is named by the id the lock already carries for them
in this event.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v143_rebuild_torneonacional2018_big_one.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

DIVISIONS = [
    Division("Doble Leg Over", "freestyle", "complete", (
        Player(1, "Antonio Linero Castro", "da631353-0d65-5a29-9572-37f115385c15"),
        Player(2, "Carlos Ramirez", "cb047679-c1ef-5ab8-8944-999ca66d1ea3"),
        Player(3, "Juan Bernardo Palacios Lemos", "3123701a-43bd-5273-8472-ba332dc67fed"),
    )),
]

if __name__ == "__main__":
    rebuild("1537994275", "2018", {"Doble Leg Over": 2}, DIVISIONS)
