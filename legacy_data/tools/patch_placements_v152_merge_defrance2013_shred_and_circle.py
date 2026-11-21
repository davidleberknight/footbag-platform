#!/usr/bin/env python3
"""
patch_placements_v152_merge_defrance2013_shred_and_circle.py

Rejoins two freestyle contests of the 13e Open de France de Footbag 2013 (event
1354752474), from its source page.

The page's results list gives each contest in full, and its manually entered copy
gives the top three:
  "Open Shred:30" 1 Aleksi Airinen, 2 Alexander Trenner, 3 Lauri Airinen,
    4 Jakob Wagner, 5 Maciek Niczyporuk, 6 Jindra Smola, 7 Rene Rühr,
    8 Pawel Nowak, 9 Rados Turek; copy "Shred 30".
  "Open Circle Contest" 1 Jindra Smola, 2 Lauri Airinen, 3 Rene Rühr,
    4 Aleksi Airinen; copy "Circle Contest".
The lock split each across the two headings: "Open Shred:30" lacked 2nd and 3rd,
held under "Shred 30", and "Circle Contest" lacked 4th, held under "Open Circle
Contest". The rebuilt rows are the full lists under "Open Shred:30" and "Circle
Contest"; "Shred 30" and "Open Circle Contest" are removed.

Every player is named by the id the lock already carries for that player in this
event, under the canon of that record. Maciek Niczyporuk is the record the lock
carries for him in the event's freestyle list, of which "Maciek" is a verified
alias.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v152_merge_defrance2013_shred_and_circle.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

ALEKSI = ("Aleksi Airinen", "7c74c3f5-dc54-5e47-8365-e84497f4c943")
LAURI = ("Lauri Airinen", "69667b03-2f4f-55b7-9c2f-79a5b60f362b")
SMOLA = ("Jindrich Smola", "0c1d57ac-f8a6-5c3e-a66f-eac82c8a5df4")
RUEHR = ("Rene Ruehr", "9585ffd8-cc96-528e-ba4a-4211da8cef00")


def listing(*players):
    return tuple(Player(i, n, pid) for i, (n, pid) in enumerate(players, 1))


DIVISIONS = [
    Division("Open Shred:30", "freestyle", "complete", listing(
        ALEKSI,
        ("Alexander Trenner", "24ffb4bb-a58e-54d8-b0d9-06b989c794cd"),
        LAURI,
        ("Jakob Wagner", "c90a00eb-95d7-5375-a769-b71cbce34d87"),
        ("Maciej Niczyporuk", "401af1f3-a976-5403-9740-210e2849f159"),
        SMOLA,
        RUEHR,
        ("Pawel Nowak", "9fccb3a3-3408-518a-aacb-43d9678fcce4"),
        ("Radosław Turek", "2002626c-155f-5447-8115-bba010c6a418"),
    )),
    Division("Circle Contest", "freestyle", "complete",
             listing(SMOLA, LAURI, RUEHR, ALEKSI)),
]

if __name__ == "__main__":
    rebuild("1354752474", "2013",
            {"Open Shred:30": 7, "Shred 30": 2,
             "Circle Contest": 3, "Open Circle Contest": 1},
            DIVISIONS)
