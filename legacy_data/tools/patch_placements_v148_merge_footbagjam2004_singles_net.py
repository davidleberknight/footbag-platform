#!/usr/bin/env python3
"""
patch_placements_v148_merge_footbagjam2004_singles_net.py

Rejoins the two singles net contests of the German Footbag Open 2004, Frankfurt
(event 1079444598), from its source page.

The page gives each contest one list:
  Intermediate Single Net  1 Ulli Haase, 2 Michael Müller, 3 Lisa Uebele, 4 DJ Fuji
  Open Single Net          1 Andreas Wolff, 2 Florian Goetze, 3 Patrick Schrickel,
                           4 Hannes Daniel
The lock split each in two: the resolved players under the page's heading
("Intermediate Single Net", "Open Single Net") and the rest under a "Singles"
spelling. The rebuilt rows are the page's lists under "Intermediate Singles Net"
and "Open Singles Net"; the "Single" divisions are removed.

Uli Haase, Michael Müller, Lisa Uebele, Andreas Wolff and Patrick Schrickel are
named by the id the lock already carries for them in this event, under the canon
of that record. Florian Goetze is the Frankfurt player of that exact name with an
established record. DJ Fuji and Hannes Daniel are written unresolved, by the
page's spelling: neither has an established record of that exact name.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v148_merge_footbagjam2004_singles_net.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

DIVISIONS = [
    Division("Intermediate Singles Net", "net", "complete", (
        Player(1, "Uli Haase", "0354318e-9155-5e89-85c4-058a9dcf310a"),
        Player(2, "Michael Müller", "6e43f6db-7d45-5068-ac3d-5c150d250323"),
        Player(3, "Lisa Uebele", "ebad1497-e45b-538a-a18a-0a3cda5d730c"),
        Player(4, "DJ Fuji"),
    )),
    Division("Open Singles Net", "net", "complete", (
        Player(1, "Andreas Wolff", "a03090dc-7534-5454-aab3-f3a074f67d33"),
        Player(2, "Florian Goetze", "ab966624-6643-5dea-b165-67e66af402f9"),
        Player(3, "Patrick Schrickel", "ee1aedfe-c34a-5e70-abf9-44650e1b1859"),
        Player(4, "Hannes Daniel"),
    )),
]

if __name__ == "__main__":
    rebuild("1079444598", "2004",
            {"Intermediate Singles Net": 3, "Intermediate Single Net": 1,
             "Open Singles Net": 3, "Open Single Net": 1},
            DIVISIONS)
