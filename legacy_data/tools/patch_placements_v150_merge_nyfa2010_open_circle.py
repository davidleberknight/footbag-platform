#!/usr/bin/env python3
"""
patch_placements_v150_merge_nyfa2010_open_circle.py

Rejoins Open Circle at the 4th Annual NYFA Freestyle and Net Symposium 2010
(event 1273248665), from its source page.

The page's results list reads "Open Circle Contest: 1. David Clavens, 2. John
Suderman, 3. Ryan Thomas, 4. Doug Tank, 5. Drew Martin, 5. Peter Bowler,
5. Kevin Hogan, 5. Mike Toolan, 5. Matt Isanuk". Its manually entered copy gives
1st to 4th under "Open Circle" and the other five, unranked, under "Other Circle
participants". The lock kept 1st to 4th under "Open Circle" and only Drew Martin,
at 1st, under "Other Circle Participants". A singles tie is several players at
one place, so the five are written at 5th, under "Open Circle"; the other
division is removed.

Every player is named by the id the lock already carries for that player in this
event, under the canon of that record, except Mike Toolan and Matt Isanuk, the
US players of those exact names with established records.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v150_merge_nyfa2010_open_circle.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, rebuild  # noqa: E402

DIVISIONS = [
    Division("Open Circle", "freestyle", "complete", (
        Player(1, "David Clavens", "033a8589-0c98-5729-a8b4-068c4efcf025"),
        Player(2, "Johnny Suderman", "11279fb2-7b1b-5ba0-b94f-11346120220c"),
        Player(3, "Ryan Thomas", "8519ad8c-7103-5eee-97c4-a08a9895da57"),
        Player(4, "Doug Tank", "373368d9-e65b-5a50-89b7-653ff4dc3a11"),
        Player(5, "Drew Martin", "0b4b650a-3eae-53c0-aeb4-f5b47ca34cc6"),
        Player(5, "Peter Bowler", "66fe4981-1fd6-5ec0-aa09-97aca3420625"),
        Player(5, "Kevin Hogan", "018c9ed2-a70b-5f10-9b77-a36a479ee64f"),
        Player(5, "Mike Toolan", "9f4a6136-047f-5cea-905d-17e66f4ca97b"),
        Player(5, "Matt Isanuk", "123465ba-8cc2-5c40-b728-e9863f2ea994"),
    )),
]

if __name__ == "__main__":
    rebuild("1273248665", "2010",
            {"Open Circle": 4, "Other Circle Participants": 1}, DIVISIONS)
