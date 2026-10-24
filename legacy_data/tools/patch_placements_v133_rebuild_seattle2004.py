#!/usr/bin/env python3
"""
patch_placements_v133_rebuild_seattle2004.py

Rebuilds the 3rd Annual Seattle Juggling and Footbag Festival (2004, event 1096318324)
from the final standings on its source page.

The page has an intermediate section ("Results INt.": shred 30, Rippin Run, Rippin
Run all around, Big 3) and an open section ("results: OPEN": Shred 30, Sick 3, Rippen
Run, Rippen Run all around). The lock carried two divisions that merged the sections
and contests. Each contest of each section is carried as its own division, as the
maintainer ruled for its two unclear lines:

  - Intermediate Shred 30's "1. Dan Reed/Sam Potter" is a tie for first: the contest
    is singles, and the next line is second. The page's own numbering is kept.
  - Open Rippen Run all around names one competitor with no place number, so it is
    not carried; that competitor's other results are.

The tricks after each Big 3 and Sick 3 name are not part of it.

Competitors are named by the id the lock already carried for that placement,
otherwise by the id the shared alias resolver returns; the page's "red usted" is the
lock's "Ethan Red Husted" at the same Sick 3 place.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v133_rebuild_seattle2004.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

ID = {
    "Dan Reed": "c4f8c15d-687e-505e-b60a-84e25fd2a045",
    "Sam Potter": "e5ae5d7c-8286-5afd-9fc9-1fd50a059ff2",
    "James Randall": "21e2a9f9-41f2-5c46-bffd-23bff53a051b",
    "Kevin Crowley": "ad54afe3-3f18-5862-87d1-4e02e4fbf9fd",
    "Sunny Freeman-Genz": "226d0da7-f659-5870-a9ac-6bff94c85319",
    "Lance Thompson": "3587cca8-27c1-5ee1-a8a0-e3b9b7bb70e5",
    "Dylan Johnson": "162332af-26d3-557e-9bf8-ff21c226fbaf",
    "Dakota Camacho": "01116b88-f438-5ade-88c8-69b34570562d",
    "Nick Landes": "48268322-19d9-5180-aac2-241293167d21",
    "Skyler Lon Smith": "11d216c3-891d-5728-981f-dc20ba381dd9",
    "Jim Penske": "4d04edec-6cd0-582d-b4e1-e8ead070a8c8",
    "Brett Campbell": "96456a6d-5895-58ab-8175-9408424e79d1",
    "Daryl Genz": "bd97ebe2-5ecd-5854-9d2e-b877a27ac527",
    "Ricky Moran": "ab216b72-e80d-526e-ba50-e8dd93866623",
    "Ethan Red Husted": "10854ae3-60d7-51a7-ad9a-36033b541bd9",
    "Nate Linscott": "11d957ec-ccf4-5fe5-b749-e80806fc0e3a",
    "Tuan Vu": "28565dd0-2196-5404-bf23-6cf0617ce79b",
}


def placed(rows):
    return tuple(Player(place, name, ID[name]) for place, name in rows)


def ranked(*names):
    return placed(list(enumerate(names, 1)))


DIVISIONS = [
    Division("Intermediate Shred 30", "freestyle", "complete", placed([
        (1, "Dan Reed"), (1, "Sam Potter"), (2, "James Randall"), (3, "Kevin Crowley"),
        (4, "Sunny Freeman-Genz"), (5, "Lance Thompson"), (6, "Dylan Johnson"),
        (7, "Dakota Camacho")])),
    Division("Intermediate Rippin Run", "freestyle", "complete", ranked(
        "Sam Potter", "Sunny Freeman-Genz", "Dan Reed", "James Randall", "Dylan Johnson",
        "Kevin Crowley")),
    Division("Intermediate Rippin Run All Around", "freestyle", "complete", ranked("Dan Reed")),
    Division("Intermediate Big 3", "freestyle", "complete", ranked("Kevin Crowley", "Nick Landes")),
    Division("Open Shred 30", "freestyle", "complete", ranked(
        "Skyler Lon Smith", "Jim Penske", "Brett Campbell")),
    Division("Open Sick 3", "freestyle", "complete", ranked(
        "Skyler Lon Smith", "Daryl Genz", "Jim Penske", "Ricky Moran", "Ethan Red Husted",
        "Nate Linscott")),
    Division("Open Rippen Run", "freestyle", "complete", ranked(
        "Nate Linscott", "Brett Campbell", "Tuan Vu", "Jim Penske", "Daryl Genz", "Ricky Moran")),
]

if __name__ == "__main__":
    rebuild("1096318324", "2004", {"Shred 30": 16, "Sick 3": 12}, DIVISIONS)
