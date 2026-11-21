#!/usr/bin/env python3
"""
patch_placements_v141_split_polish2019_merged_lists.py

Restores four contests of the XIX Polish Footbag Championships, Krakow 2019
(event 1567551985), from its source page.

  "Sick 3" held the page's Sick 3 list ("1. Jakub Worek, 2. Jakub Mościszewski,
    3. Filip Wójcik") merged by place with its Big 1 list ("1. Jakub Mościszewski,
    2. Rafał Kaleta, 3. Paweł Nowak, 4. Filip Wójcik, 5. Jakub Worek").
  "Footbag Golf" held the 2 Squares list ("1. Szymon Kałwak, 2. Filip Wójcik,
    3. Paweł Rożek") as club-suffixed pseudo-teams beside the golf players.
  "Open Battles" and "Open Circle Contest" held only 2nd place. The page marks
    its Polish players' national ranks in brackets ("1. (1) Paweł Nowak"), and
    those lines were lost; only the unbracketed 2nd survived.

The rebuilt rows are the page's lists:
  Sick 3               1 Worek, 2 Mościszewski, 3 Wójcik
  Big 1                1 Mościszewski, 2 Kaleta, 3 Nowak, 4 Wójcik, 5 Worek
  Footbag Golf         1 Michał Klimczak, 2 Marcin Czech, 3 Michał Róg
  2 Squares            1 Szymon Kałwak, 2 Filip Wójcik, 3 Paweł Rożek
  Open Battles         1 Nowak, 2 Trenner, 3 Stanek, 4 Kaleta
  Open Circle Contest  1 Worek, 2 Trenner, 3 Mościszewski, 4 Kaleta

Every player is named by the id the lock already carries for that player in this
event, under the canon of that record.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v141_split_polish2019_merged_lists.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

WOREK = ("Jakub Worek", "0da84e00-c9f5-5d23-82b6-9ec1e759c74c")
MOSCISZEWSKI = ("Jakub Mosciszewski", "7a8314b4-2af9-584d-bd79-4af7a74d9c21")
WOJCIK = ("Filip Wojcik", "6d948954-90cb-5446-9a60-9d4ca0ef4734")
KALETA = ("Rafal Kaleta", "82c36f56-236f-4496-826b-cf59a6fcc4ed")
NOWAK = ("Pawel Nowak", "9fccb3a3-3408-518a-aacb-43d9678fcce4")
STANEK = ("Arkadiusz Stanek", "8859edda-82f6-5013-97d0-1057cb8bdd3b")
TRENNER = ("Alexander Trenner", "24ffb4bb-a58e-54d8-b0d9-06b989c794cd")


def listing(*players):
    return tuple(Player(i, n, pid) for i, (n, pid) in enumerate(players, 1))


DIVISIONS = [
    Division("Sick 3", "freestyle", "complete",
             listing(WOREK, MOSCISZEWSKI, WOJCIK)),
    Division("Big 1", "freestyle", "complete",
             listing(MOSCISZEWSKI, KALETA, NOWAK, WOJCIK, WOREK)),
    Division("Footbag Golf", "golf", "complete", listing(
        ("Michal Klimczak", "b980fe51-dd4b-54fd-bb60-21cbb482f674"),
        ("Marcin Czech", "bb89d2bb-12af-5038-a092-0b4cf1269860"),
        ("Michal Rog", "392ef8ff-d969-5917-8bc5-176805ecb787"),
    )),
    Division("2 Squares", "sideline", "complete", listing(
        ("Szymon Kalwak", "4ae1304e-960b-554f-8ce7-c59e0d7607b2"),
        WOJCIK,
        ("Pawel Rozek", "0b3ffb10-2257-510e-a69a-26ff2fc87508"),
    )),
    Division("Open Battles", "freestyle", "complete",
             listing(NOWAK, TRENNER, STANEK, KALETA)),
    Division("Open Circle Contest", "freestyle", "complete",
             listing(WOREK, TRENNER, MOSCISZEWSKI, KALETA)),
]

if __name__ == "__main__":
    rebuild("1567551985", "2019",
            {"Sick 3": 8, "Footbag Golf": 9, "Open Battles": 1, "Open Circle Contest": 1},
            DIVISIONS)
