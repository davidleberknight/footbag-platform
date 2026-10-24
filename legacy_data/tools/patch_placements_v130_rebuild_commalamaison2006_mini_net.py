#!/usr/bin/env python3
"""
patch_placements_v130_rebuild_commalamaison2006_mini_net.py

Rebuilds Mini Net at CommALaMaison Contest 3 (2006, event 1160579826) from the final
standings on its source page.

The page gives the final standings, then the knockout scores and four qualification
pools. Its final standings tie four players at fifth; the lock carried a fifth player
there who appears on the page only as fifth of a qualification pool. Only the final
standings are carried.

  Mini Net  1 Lima, 2 Ledain, 3 Tellenbach, 4 Rémy, 5 Bardeau, 5 Brunet,
            5 Amengual, 5 Baillon

Competitors are named by the id the lock already carried for that placement,
otherwise by the id the shared alias resolver returns; the fifth-placed Bardeau keeps
the id of the lock row that held his place ("Pierrot Bardeau"; the page writes
"Pierro"). A nickname in quotes is not part of a name.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v130_rebuild_commalamaison2006_mini_net.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

DIVISIONS = [
    Division("Mini Net", "net", "complete", (
        Player(1, "Greg Lima", "c7a23f15-f2ed-5f2b-ac50-bb1adb185475"),
        Player(2, "Arthur Ledain", "e528ca88-e462-5870-bd7f-45fb49bfbcfc"),
        Player(3, "Grischa Tellenbach", "ec1d5118-cd4b-591f-a84a-04bbe20868bc"),
        Player(4, "Franck Rémy", "d31e8ab0-0924-5e2c-b3f8-560279e37c9a"),
        Player(5, "Pierrot Bardeau", "4b0cfb19-6a41-56cf-acac-5c3807dbe79d"),
        Player(5, "Marco Brunet", "c91a2084-4b3a-5614-8b34-a52171742e13"),
        Player(5, "Lisa Amenguale", "04f32be4-d341-5f17-b5e4-23df053befff"),
        Player(5, "Olivier Zitoun Baillon", "54bcc05b-f2a3-531c-b0ca-c94a1c5f243a"),
    )),
]

if __name__ == "__main__":
    rebuild("1160579826", "2006", {"Mini Net": 9}, DIVISIONS)
