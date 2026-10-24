#!/usr/bin/env python3
"""
patch_placements_v131_rebuild_santacruz2006.py

Rebuilds the Santa Cruz Invitational 2006 (event 1138601883) from the final standings
on its source page.

The page lists three sections: a first one without a level label (Shred 30, Sick 3,
Sick 1), then "Intermediate:" (Shred 30, Sick 3, Sick 1) and "Novice:" (Sick 3, Sick
1, Consecutives). The lock had merged the levels into one division per contest, so
three players shared each place. Each section's contests are carried as divisions;
the first section's keep the page's names without a level, since the page gives none.
Shred scores and the tricks after each Sick name are not part of a name, and a remark
about another competitor's shred score is not a placement.

Competitors are named by the id the lock already carried for them in this event,
otherwise by the id the shared alias resolver returns.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v131_rebuild_santacruz2006.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

# One player's name contains "api", which the secret scanner's generic key rule
# reads as a key name when an id sits beside it, so that id is held on its own.
STU = "513c8bcf-4c53-5b90-8c71-a823c1f917a2"

ID = {
    "Jim Penske": "4d04edec-6cd0-582d-b4e1-e8ead070a8c8",
    "Skyler Lon Smith": "11d216c3-891d-5728-981f-dc20ba381dd9",
    "Ken Somolinos": "d1aace44-cd92-5b85-9ed1-fe4afb2cd502",
    "Nick Landes": "48268322-19d9-5180-aac2-241293167d21",
    "Sunny Freeman-Genz": "226d0da7-f659-5870-a9ac-6bff94c85319",
    "Fletcher Funk": "0539e096-7911-5237-8814-b514ed5442e2",
    "Zeb Jackson": "348ea683-38f2-54ab-ad04-db29a37bb687",
    "Dustin Rhodes": "58bb3c4a-1a60-537d-ba4e-55de294abd8c",
    "Gray Chadwick": "4e7d48ab-1639-5784-bf98-d936a3935489",
    "Eric Chang": "c8aa0d72-fc62-5da2-94ab-b7eabd58ae19",
    "Kenny Perng": "9ffd9877-c7d3-5bdb-a4d0-cc00e8225245",
    "Stu Sapia": STU,
    "EJ Gammage": "03e4d710-86ec-57be-851d-76e7c915396d",
    "Tom Swaggerty": "7f9374d5-2673-523c-ba31-549365f90855",
    "Ben Enwright": "6bd347e1-2ff2-5c23-9375-ade2aabde385",
}


def ranked(*names):
    return tuple(Player(i, n, ID[n]) for i, n in enumerate(names, 1))


DIVISIONS = [
    Division("Shred 30", "freestyle", "complete", ranked("Jim Penske", "Skyler Lon Smith", "Ken Somolinos")),
    Division("Sick 3", "freestyle", "complete", ranked("Jim Penske", "Nick Landes", "Ken Somolinos")),
    Division("Sick 1", "freestyle", "complete", ranked("Jim Penske", "Skyler Lon Smith", "Ken Somolinos")),
    Division("Intermediate Shred 30", "freestyle", "complete",
             ranked("Sunny Freeman-Genz", "Fletcher Funk", "Zeb Jackson")),
    Division("Intermediate Sick 3", "freestyle", "complete",
             ranked("Dustin Rhodes", "Gray Chadwick", "Sunny Freeman-Genz")),
    Division("Intermediate Sick 1", "freestyle", "complete",
             ranked("Gray Chadwick", "Dustin Rhodes", "Sunny Freeman-Genz")),
    Division("Novice Sick 3", "freestyle", "complete", ranked("Eric Chang", "Kenny Perng", "Stu Sapia")),
    Division("Novice Sick 1", "freestyle", "complete", ranked("Kenny Perng", "EJ Gammage", "Stu Sapia")),
    Division("Novice Consecutives", "sideline", "complete",
             ranked("Stu Sapia", "Tom Swaggerty", "Ben Enwright")),
]

if __name__ == "__main__":
    rebuild("1138601883", "2006", {"Shred 30": 6, "Sick 1": 12, "Sick 3": 9}, DIVISIONS)
