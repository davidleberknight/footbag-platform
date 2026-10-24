#!/usr/bin/env python3
"""
patch_placements_v115_rebuild_gyor2005_combo.py

Rebuilds the combo division of Footbag Jam Gyor 2005 (event 1102788509) from its
source page.

The lock held the combo as "Rewind Combo" with each place a team of the
competitor and their trick ("Vasek Klouda / Bedwetter>Frantic Butterfly"), and
its third place missing. The page lists it as "Open Freestyle Combo":
  1 Vasek Klouda, 2 Felix Zenger, 3 lurko

The first two are named by the ids the frozen team rows carried, which the shared
alias resolver also returns. "lurko" is a single word with no record; it is left
unresolved and shows as an unknown competitor.

The event's other divisions are not touched: they carry no trick text.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v115_rebuild_gyor2005_combo.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

DIVISIONS = [
    Division("Open Freestyle Combo", "freestyle", "complete", (
        Player(1, "Vaclav Klouda", "98ce4e04-05ca-56ca-b8c6-83f51c164c89"),
        Player(2, "Felix Zenger", "04a43526-37ba-5ea0-a01c-8e357a694c42"),
        Player(3, "lurko"))),
]

if __name__ == "__main__":
    rebuild("1102788509", "2005", {"Rewind Combo": 2}, DIVISIONS)
