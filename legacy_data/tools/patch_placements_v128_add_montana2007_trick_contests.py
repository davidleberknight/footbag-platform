#!/usr/bin/env python3
"""
patch_placements_v128_add_montana2007_trick_contests.py

Adds the three contests of Montana Footbag Jam 2007 (event 1173467292) that the lock
lacked: Rippin Run, Sick Trick and Sick3, each in its Intermediate and Open level.

The page lists Shred30, Rippin Run, Sick Trick and Sick3, each split into
"Intermediate:" and "Open:", every Sick Trick and Sick3 line naming the competitor
and then the tricks they threw. The lock carried only the Shred30 lists; this adds
the other six. The trick text after each name is not part of it.

Competitors are named by the id the lock already carries for them in this event,
otherwise by the id the shared alias resolver returns.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v128_add_montana2007_trick_contests.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

ID = {
    "Zac Jackson": "8fc44a4b-aa33-5106-8cc6-8f2303bf1b0e",
    "Jim Penske": "4d04edec-6cd0-582d-b4e1-e8ead070a8c8",
    "Gray Chadwick": "4e7d48ab-1639-5784-bf98-d936a3935489",
    "Jake Wren": "67f14498-b4d7-54f4-ad8a-3a4d95ccbd24",
    "Kyle Hewitt": "9f9142e1-95ac-511a-b996-7873698c7818",
    "Zeb Jackson": "348ea683-38f2-54ab-ad04-db29a37bb687",
    "Byrin Wylie": "bf5ce745-18b5-50b5-87a5-b2af6ffbf21c",
    "Nick Landes": "48268322-19d9-5180-aac2-241293167d21",
    "Andrew Grant": "8606f658-92cd-570c-bf5e-2865de4a9b48",
    "Kevin Regamey": "6c912402-7d0e-580d-938c-7c6542c48bb1",
    "Daryl Genz": "bd97ebe2-5ecd-5854-9d2e-b877a27ac527",
    "Rory Dawson": "e53e759e-e2e1-589b-a5b2-4c95e89b8e8c",
    "Jacob Wren": "1bfb569c-6400-5fbb-aca1-66b0cfb3abc3",
    "Benjamin Benulis": "7afe03a1-08a3-5ea2-a884-f56589aeea38",
    "Luis Monhollon": "23c6748c-39f8-5ecd-ae9c-c3d83c0bfec6",
}


def ranked(*names):
    return tuple(Player(i, n, ID[n]) for i, n in enumerate(names, 1))


DIVISIONS = [
    Division("Intermediate Rippin Run", "freestyle", "complete", ranked("Zac Jackson")),
    Division("Open Rippin Run", "freestyle", "complete", ranked("Jim Penske")),
    Division("Intermediate Sick Trick", "freestyle", "complete", ranked(
        "Gray Chadwick", "Jake Wren", "Kyle Hewitt", "Zeb Jackson", "Zac Jackson")),
    Division("Open Sick Trick", "freestyle", "complete", ranked(
        "Byrin Wylie", "Nick Landes", "Jim Penske", "Andrew Grant", "Kevin Regamey",
        "Daryl Genz", "Rory Dawson")),
    Division("Intermediate Sick3", "freestyle", "complete", ranked(
        "Kyle Hewitt", "Gray Chadwick", "Jacob Wren", "Zac Jackson", "Zeb Jackson",
        "Benjamin Benulis")),
    Division("Open Sick3", "freestyle", "complete", ranked(
        "Jim Penske", "Nick Landes", "Daryl Genz", "Kevin Regamey", "Rory Dawson",
        "Luis Monhollon")),
]

if __name__ == "__main__":
    rebuild("1173467292", "2007", {}, DIVISIONS)
