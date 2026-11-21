#!/usr/bin/env python3
"""
patch_placements_v149_merge_greencup2007_net_brackets.py

Rejoins the two net contests of The Green Cup 2007 (event 1164845982), from its
source page.

The page lists each contest under two bracket headings, "Division A" and
"Division B", and says the brackets are drawn from the players and teams who do
and do not advance from pool play. The places run on across the brackets: Open
Doubles 1 to 8 in A and 9 to 15 in B, Open Singles 1 to 12 in A and 13 to 18 in
B. Each is one contest, and the lock stored its brackets as two divisions.

The rebuilt rows are each contest's full list under its Division A name ("Open
Doubles - Division A", "Open Singles - Division A"), places as the page gives
them; the Division B divisions are removed.

Singles players are named by the id the lock already carries for that player in
this event, under the canon of that record. 12th is written unresolved as
"Sage", the page's name without its scratch and footnote marks. Teams are team
rows, named by each member's canon, which the export resolves member by member.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v149_merge_greencup2007_net_brackets.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, Team, rebuild  # noqa: E402


def teams(*pairs):
    return tuple(Team(i, pair) for i, pair in enumerate(pairs, 1))


DIVISIONS = [
    Division("Open Doubles - Division A", "net", "complete", teams(
        ("John Leys", "Eric Wulff"),
        ("Alexis Deschenes", "Patrick Schrickel"),
        ("Yves Archambault", "Luc Legeault"),
        ("Jack Harris", "P.T. Lovern"),
        ("Cory Current", "Patrick Keehan"),
        ("Jody Badger Welch", "Chris Ott"),
        ("Steve Dusablon", "Chris Siebert"),
        ("Jim Derricott", "Tuan Vu"),
        ("Jeremy Mirken", "AJ Shultz"),
        ("Benjamin Alston", "Walt Houston"),
        ("Chris Young", "Sage Woodmansee"),
        ("Jim Hankins", "Edwin Veltman"),
        ("Hung Chang", "Theodore Fritsch"),
        ("Josh Penney", "Anthony Intemann"),
        ("Lisa McDaniel Jones", "Amy Westberg"),
    )),
    Division("Open Singles - Division A", "net", "complete", (
        Player(1, "John Leys", "3b938feb-b4c7-59a1-929f-7b62be77c1ce"),
        Player(2, "Yves Archambault", "691f48a0-1dbd-5ef5-99ea-13615a7437d2"),
        Player(3, "Alexis Deschenes", "4f763ef4-fb7b-5fcb-9883-988370e20b2e"),
        Player(4, "Patrick Schrickel", "ee1aedfe-c34a-5e70-abf9-44650e1b1859"),
        Player(5, "Luc Legeault", "c86e3f98-1abf-59a0-bd1a-2dcb61f7e241"),
        Player(6, "Cory Current", "f1f49edd-da47-536a-b759-de441795fc2f"),
        Player(7, "Jody Badger Welch", "e333a5e6-3d76-513c-a9a4-f34c09c31b96"),
        Player(8, "P.T. Lovern", "7c5778f0-6847-58e6-9e37-09967ef3db13"),
        Player(9, "Jeremy Mirken", "31bd4e75-1a44-56b4-94b3-071cdc8dee82"),
        Player(10, "Edwin Veltman", "62bdd1f4-4414-5259-9996-91770a34d09f"),
        Player(11, "AJ Shultz", "071ff943-073b-5edb-b2b1-ae6bb1676176"),
        Player(12, "Sage"),
        Player(13, "Walt Houston", "c6704eb0-91e0-538b-8806-9a43b16e91cb"),
        Player(14, "Chris Young", "646452e8-7ede-58d9-aa7d-f82c092800ad"),
        Player(15, "Theodore Fritsch", "738cbf71-ad21-598f-a5b3-afdb8bdf543d"),
        Player(16, "Benjamin Alston", "76079f4a-40db-5e3c-97e1-99e590791839"),
        Player(17, "Jim Hankins", "61656316-f92f-5235-a6fd-e3218d5601f8"),
        Player(18, "Josh Penney", "ffb44633-32b2-5794-8239-1e20e2c68e23"),
    )),
]

if __name__ == "__main__":
    rebuild("1164845982", "2007",
            {"Open Doubles - Division A": 8, "Open Doubles - Division B": 7,
             "Open Singles - Division A": 12, "Open Singles - Division B": 6},
            DIVISIONS)
