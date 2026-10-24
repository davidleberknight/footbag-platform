#!/usr/bin/env python3
"""
patch_placements_v119_rebuild_rnh2004_sick3_big1.py

Rebuilds the Sick 3 and Big1 divisions of RNH Contest 2004 (event 1080138513)
from its source page.

The lock held the Big1 contest under a trick line read as its heading
("Dimwalk>Double Legover>Smudge", filed as net), with its places out of order and
three competitors it does not list, and held Sick 3 with a fifth-place competitor
the page lists only in Big1. The page gives:
  Sick 3  1 Boucoiran, 2 Kabache, 3 Touzelet, 4 Ledain, 5 Bauer,
          6 Tellenbach, 7 Dupuy, 8 Clemente
  Big1    1 Boucoiran, 2 Ledain, 3 Tellenbach, 4 Touzelet, 5 Bardeau, 6 Bauer

Every competitor is named by the id the lock already carried for them in this
event.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v119_rebuild_rnh2004_sick3_big1.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

BOUCOIRAN = Player(0, "Maxime Boucoiran", "8069a4cf-1543-5a0a-bf83-92edff9e120f")
KABACHE = Player(0, "Cyril Kabache", "49f5ef51-1743-5092-98e7-9d8fab01b53c")
TOUZELET = Player(0, "Frédéric Touzelet", "bfa81320-2dd7-5c54-85ed-98f8a778a4be")
LEDAIN = Player(0, "Arthur Ledain", "e528ca88-e462-5870-bd7f-45fb49bfbcfc")
BAUER = Player(0, "Jochen Bauer", "80b8a17d-8f44-5571-881e-cd86f3c5c49e")
TELLENBACH = Player(0, "Grischa Tellenbach", "ec1d5118-cd4b-591f-a84a-04bbe20868bc")
DUPUY = Player(0, "Charles Dupuy", "a6177af9-a854-56a6-a47a-083c3aacf209")
CLEMENTE = Player(0, "Miquel Clemente", "2eaccb7b-430c-5678-b982-9415b20b24cf")
BARDEAU = Player(0, "Pierre Bardeau", "47d5bbdb-0fd7-5c80-8ace-118ef3d16fa8")


def ranked(*players: Player) -> tuple[Player, ...]:
    return tuple(Player(i, p.name, p.person_id) for i, p in enumerate(players, 1))


DIVISIONS = [
    Division("Sick 3", "freestyle", "complete",
             ranked(BOUCOIRAN, KABACHE, TOUZELET, LEDAIN, BAUER, TELLENBACH, DUPUY, CLEMENTE)),
    Division("Big1", "freestyle", "complete",
             ranked(BOUCOIRAN, LEDAIN, TELLENBACH, TOUZELET, BARDEAU, BAUER)),
]

if __name__ == "__main__":
    rebuild("1080138513", "2004", {"Dimwalk>Double Legover>Smudge": 7, "Sick 3": 9}, DIVISIONS)
