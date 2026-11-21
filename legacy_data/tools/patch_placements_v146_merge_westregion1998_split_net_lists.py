#!/usr/bin/env python3
"""
patch_placements_v146_merge_westregion1998_split_net_lists.py

Rejoins two contests of the Western Regional Footbag Championships 1998 (event
876356874) whose places the lock split across two divisions, from its source
page.

The page gives each contest one list. The lock read the field-size note in the
heading as a second division and stored the winner there:
  "Women's Intermediate Singles Net (6 competitors)" held 1st, and "Women's
    Intermediate Singles Net" held 2nd to 5th;
  "Open Mixed Doubles Net (15 teams)" held 1st, and "Open Mixed Doubles Net"
    held 2nd to 13th.

The rebuilt rows are the page's lists:
  Women's Intermediate Singles Net  1 Marie-Ange Cossette-Trudel, 2 Debbie Fisher,
                                    3 Lisa Wachholz, 4 Annie Leys,
                                    5 Ann Kaplan, 5 Amber Ott
  Open Mixed Doubles Net            1 Westberg / Bouchard, 2 Welch / Welch,
                                    3 Symons / Deschenes, 4 LaMarche / Adams,
                                    5 Julin / Butcher, 9 Fisher / Jones,
                                    13 Evans / Caveney

The divisions without the note keep their names; the ones carrying it are
removed. The page ties 5th, 9th and 13th in mixed doubles ("5-8 did not play
off"). A doubles place holds one team in the lock, so the first team the page
lists at each tied place is written here, and the teams tied with it are added
by TIED_TEAM team corrections, which keep each as its own entry at that place.

Singles players are named by the id the lock already carries for that player in
this event, under the canon of that record. Marie-Ange Cossette-Trudel has no
established record and is left unresolved, as the lock held her. Teams are team
rows, named by each member's canon, which the export resolves member by member.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v146_merge_westregion1998_split_net_lists.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, Team, rebuild  # noqa: E402

DIVISIONS = [
    Division("Women's Intermediate Singles Net", "net", "complete", (
        Player(1, "Marie-Ange Cossette-Trudel"),
        Player(2, "Debbie Fisher", "d8bab804-1700-51fb-b5e6-2c2d7eab0e46"),
        Player(3, "Lisa Wachholz", "09509e3c-2132-542b-b40f-8abbbf00f63a"),
        Player(4, "Annie Leys", "6d5caabc-3393-51dd-8b7f-4690a3913e1d"),
        Player(5, "Ann Kaplan", "61d9a3e5-b62a-59cc-925a-9e030c659b6a"),
        Player(5, "Amber Ott", "65fcd1f2-afba-542d-926c-01e1225078d3"),
    )),
    Division("Open Mixed Doubles Net", "net", "complete", (
        Team(1, ("Amy Westberg", "Emmanuel Bouchard")),
        Team(2, ("Jody Badger Welch", "Brent Welch")),
        Team(3, ("Julie Symons", "Alexis Deschenes")),
        Team(4, ("Evanne LaMarche", "Rob Adams")),
        Team(5, ("Lonya Julin", "David Butcher")),
        Team(9, ("Debbie Fisher", "JJ Jones")),
        Team(13, ("Dea Evans", "Jim Caveney")),
    )),
]

if __name__ == "__main__":
    rebuild("876356874", "1998",
            {"Women's Intermediate Singles Net": 5,
             "Women's Intermediate Singles Net (6 Competitors)": 1,
             "Open Mixed Doubles Net": 14,
             "Open Mixed Doubles Net (15 Teams)": 1},
            DIVISIONS)
