#!/usr/bin/env python3
"""
patch_placements_v124_add_swiss_footjam2001_swiss_ranking.py

Adds the Swiss national ranking of FootJam 2001, the Swiss Footbag Championships
(event 981560223), as its own division.

The page's "Final Swiss Ranking" is the result of a separate Swiss final round
("Group C (Swiss Finals)" in its score tables), with its own order: the national
title the event is named for, not a re-ranking of the overall final. Its unnumbered
line shares the place above it, as everywhere on the page; the round's scores have
the two players at third level on 15.

  Mens Open Freestyle Swiss Ranking  1 Capacoel, 2 Dubuis, 3 Weber, 3 Bagic,
                                     5 Marchianni, 6 Cazzaro, 7 Döbeli, 8 Hitz, 9 Müller

Each competitor is named by the id the lock already carries for them in this
event, otherwise by the id the shared alias resolver returns.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v124_add_swiss_footjam2001_swiss_ranking.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

SWISS_RANKING = [
    (1, "Jose Capacoel", "fe184f4c-0162-5f45-b383-033fae169883"),
    (2, "Christian Dubuis", "3338bcb4-14a7-5500-9098-3df100054df2"),
    (3, "Kahu Weber", "aa21c1a8-e1ac-5f9e-93e5-b442ac0046c1"),
    (3, "Niki Bagic", "d66bd452-973a-5be7-8ea7-123e97cba915"),
    (5, "Paolo Marchianni", "ce9bdf21-c76c-55d6-b4fe-a6ba555b6982"),
    (6, "Ulli Cazzaro", "6cf992d3-bd66-551e-9c08-82136518bd03"),
    (7, "Marco Döbeli", "5fc5f6c4-2883-5af7-9870-04d8c9378031"),
    (8, "Christoph Hitz", "7191ace0-3944-5433-85bb-6c80a6df482b"),
    (9, "Stefan Müller", "4f30afe3-3cc9-5781-8f31-cad3a87d30ae"),
]

DIVISIONS = [
    Division("Mens Open Freestyle Swiss Ranking", "freestyle", "complete",
             tuple(Player(place, name, pid) for place, name, pid in SWISS_RANKING)),
]

if __name__ == "__main__":
    rebuild("981560223", "2001", {}, DIVISIONS)
