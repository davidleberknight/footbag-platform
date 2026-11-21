#!/usr/bin/env python3
"""
patch_placements_v140_split_czech2006_merged_lists.py

Splits the merged lists of the Czech Footbag Championships 2006 (event
1137937282) apart, from its source page.

The page gives each contest its own list, three places each. The lock merged
four of them into their neighbours by place:
  "rutina intermediate" held the "rutina holky" (girls' routine) players and the
    "rutina dvojic" (pairs routine) teams at every place;
  "sick 3" held the "big 1" players at every place;
  "net" (the "jednotlivci", singles, list) held the "dvojice" (doubles) teams.

The rebuilt rows are the page's seven lists:
  Rutina Intermediate  1 Otto Remiš, 2 Tomáš Šolc, 3 Vojtěch Krůta
  Women's Routines     1 Jana Čačáková, 2 Hanka Kusnjerová, 3 Terka Drbohlavová
  Doubles Routines     1 Klouda + Weber, 2 Struž + Červený, 3 Zelinka + Benda
  Sick 3               1 Vašek Klouda, 2 Honza Weber, 3 Aleš Zelinka
  Big 1                1 Honza Weber, 2 Vašek Klouda, 3 Jan Struž
  Net                  1 Pavel Hejra, 2 Martin Huleja, 3 Jan Struž
  Doubles Net          1 Struž + Huleja, 2 Hejra + Daněk, 3 Červený + Stejskal

"Rutina Intermediate", "Sick 3" and "Net" keep their names, so the discipline
fixes that rename and recategorise them still apply. The routine was stored under
the net category; it is written as freestyle.

Singles players are named by the id the lock already carried for them in this
event, under the canon of that record. Teams are team rows, named by each
member's canon, which the export resolves member by member.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v140_split_czech2006_merged_lists.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, Team, rebuild  # noqa: E402

KLOUDA = ("Vaclav Klouda", "98ce4e04-05ca-56ca-b8c6-83f51c164c89")
WEBER = ("Jan Weber", "1e09ba09-ec4b-5961-8b95-e0d638dc4f5c")
ZELINKA = ("Ales Zelinka", "f2e73bec-d859-51b9-8312-edb5a473e83e")
STRUZ = ("Jan Struz", "28ed65ae-ea5e-5e04-bff5-97b8f71e6696")

DIVISIONS = [
    Division("Rutina Intermediate", "freestyle", "complete", (
        Player(1, "Otto Remis", "03607deb-e269-5775-b8c3-36873c6aa3b6"),
        Player(2, "Tomas Solc", "a9a940f8-ea34-598b-a8a7-b64548c7c5c9"),
        Player(3, "Vojtìch Krùta", "2288a780-8b46-517f-8126-371954f7b8eb"),
    )),
    Division("Women's Routines", "freestyle", "complete", (
        Player(1, "Jana Čačáková", "bd0010df-d5b7-5860-a1c0-fb5ed7523815"),
        Player(2, "Hanka Kusnjerová", "249b7568-9f0d-58db-8528-391c2ef34aa0"),
        Player(3, "Terka Drbohlavová", "2e012db8-075c-5637-b83f-5c15b043b1ff"),
    )),
    Division("Doubles Routines", "freestyle", "complete", (
        Team(1, ("Vaclav Klouda", "Jan Weber")),
        Team(2, ("Jan Struz", "Pavel Cerveny")),
        Team(3, ("Ales Zelinka", "Milan Benda")),
    )),
    Division("Sick 3", "freestyle", "complete", (
        Player(1, *KLOUDA), Player(2, *WEBER), Player(3, *ZELINKA),
    )),
    Division("Big 1", "freestyle", "complete", (
        Player(1, *WEBER), Player(2, *KLOUDA), Player(3, *STRUZ),
    )),
    Division("Net", "net", "complete", (
        Player(1, "Pavel Hejra", "fb09d2be-a773-5bc1-9da3-60cbabff4338"),
        Player(2, "Martin Huleja", "1e9f9cf3-272a-587b-bba7-58c87f9991a7"),
        Player(3, *STRUZ),
    )),
    Division("Doubles Net", "net", "complete", (
        Team(1, ("Jan Struz", "Martin Huleja")),
        Team(2, ("Pavel Hejra", "Michal Danek")),
        Team(3, ("Pavel Cerveny", "Petr Stejskal")),
    )),
]

if __name__ == "__main__":
    rebuild("1137937282", "2006",
            {"Rutina Intermediate": 9, "Sick 3": 6, "Net": 6}, DIVISIONS)
