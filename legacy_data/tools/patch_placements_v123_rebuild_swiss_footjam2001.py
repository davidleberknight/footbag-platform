#!/usr/bin/env python3
"""
patch_placements_v123_rebuild_swiss_footjam2001.py

Rebuilds five divisions of FootJam 2001, the Swiss Footbag Championships (event
981560223), from the final standings on its source page.

The lock held under a third of the page's placements: most of each net division
missing, Women's Open Freestyle filed as net, and Men's Open Freestyle built from a
mixture of the overall final ranking and the separate Swiss ranking, so several
players held two places. The page's own notation gives ties: a line without a
number shares the place of the numbered line above it, and the next number skips
by the size of the tie (Intermediate Doubles Net runs 5, 5, 5, 5, 9; Men's Open
Freestyle runs 9 for fifteen players, then "25. all the rest", which names nobody
and is not carried). The Swiss semifinal scores confirm it: the two players sharing
third there scored the same. Club and country suffixes are not part of a name.

The "Final Swiss Ranking" block and the round-by-round score tables are not
touched by this patch.

Singles competitors are named by the id the lock already carried for them in this
event, otherwise by the id the shared alias resolver returns, otherwise left
unresolved. Doubles teams are team rows, which the export resolves member by
member.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v123_rebuild_swiss_footjam2001.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, Team, rebuild  # noqa: E402


def players(rows):
    return tuple(Player(place, name, pid) for place, name, pid in rows)


def teams(rows):
    return tuple(Team(place, tuple(pair)) for place, pair in rows)


INTERMEDIATE_SINGLES_NET = [
    (1, "Daniel Schläpfer", "1631fe5a-47d0-50ef-a901-07d8a09ab51a"),
    (2, "Beni Zahner", "a47d1872-8a14-5644-80a7-1b4ea47b202d"),
    (3, "Paolo Marchianni", "ce9bdf21-c76c-55d6-b4fe-a6ba555b6982"),
    (3, "Kahu Weber", "aa21c1a8-e1ac-5f9e-93e5-b442ac0046c1"),
    (5, "Martin Villalba", "e6d555cc-7022-5505-8669-59eda8412951"),
    (5, "Geri Waldispühl", "e224c612-2853-5de3-854c-59d7773cf055"),
    (5, "Dominik Rutz", "7ca5220d-9756-5d12-85cc-a1a14f550aae"),
    (5, "Ulli Cazzaro", "6cf992d3-bd66-551e-9c08-82136518bd03"),
    (5, "Galen Gilmore", ""),
]

INTERMEDIATE_DOUBLES_NET = [
    (1, ("B. Dubuis", "Berger")), (2, ("Stillhard", "Meier")),
    (3, ("Zahner", "Waldispühl")), (3, ("C. Dubuis", "Döbeli")),
    (5, ("Gilmore", "Marchianni")), (5, ("Remy", "Tonzelet")),
    (5, ("Schläpfer", "Rutz")), (5, ("Schmidt", "Latotzky")),
    (9, ("Widmer", "Weber")), (9, ("Roth", "Miguel")), (9, ("Gysin", "Eris")),
    (9, ("Hunziker", "Hurkuk")), (9, ("Zierath", "Henschen")), (9, ("Dargent", "Christen")),
    (9, ("Harr", "Durrenberger")), (9, ("Läser", "Erismann")), (9, ("Bagic", "Capacoel")),
    (9, ("Helfer", "Leuenberger")), (9, ("Pinos", "Struz")), (9, ("Villalba", "Cazzaro")),
]

OPEN_DOUBLES_NET = [
    (1, ("Florian Götze", "Max Gerhardt")), (2, ("Andreas Wolff", "Henning Goetzke")),
    (3, ("Patrik Schrickel", "Philipp Nierstheimer")), (4, ("Davy Lernould", "David Chabannes")),
    (5, ("Chris Löw", "Phillip Schäfer")), (5, ("Yassin Khateeb", "Thomas Förster")),
]

WOMENS_OPEN_FREESTYLE = [
    (1, "Isabelle Widmer", "bdd1f637-2375-503d-b2c3-01094f7ab049"),
    (2, "Jule Böhm", "1cf1eda3-ba6d-5074-aaa7-85e6c5bb6567"),
    (3, "Tsering Christen", "45a66f2a-28c9-5aaa-902c-82ce1b96bded"),
    (4, "Nora Henschen", "07f70485-6491-5feb-9664-92374a9e796e"),
    (5, "Claire Beltrain", "1855005c-8c35-5953-a81f-ac8ca9f3908e"),
    (6, "Corina Giger", "827f3d99-0101-511e-8212-d1e5945c18b2"),
    (6, "Anne Busch", "c7308982-a2af-598b-baf9-a0515c121cf7"),
    (8, "Nina Mader", "3122e725-e2ab-5117-9bda-c1b9fb9f476e"),
    (8, "Lila Siewczyk", ""),
]

MENS_OPEN_FREESTYLE = [
    (1, "Henning Goetzke", "f6e8bbc6-d43b-5e8d-a0b7-1b426b5e7dee"),
    (2, "Ales Zelinka", "f2e73bec-d859-51b9-8312-edb5a473e83e"),
    (3, "Sebastian Kleinichen", "9c0c5c31-1dc7-55b9-8fcc-1a9343303d63"),
    (4, "Franck Rémy", "d31e8ab0-0924-5e2c-b3f8-560279e37c9a"),
    (5, "Christian Dubuis", "3338bcb4-14a7-5500-9098-3df100054df2"),
    (6, "Jose Capacoel", "fe184f4c-0162-5f45-b383-033fae169883"),
    (7, "Tomas Tyrpekl", "97b4db80-0f51-5701-9dc2-aba083758a58"),
    (8, "David Chabannes", "d3f99c1e-fd05-5579-b3eb-34da912c3256"),
    (9, "Kahu Weber", "aa21c1a8-e1ac-5f9e-93e5-b442ac0046c1"),
    (9, "Niki Bagic", "d66bd452-973a-5be7-8ea7-123e97cba915"),
    (9, "Paolo Marchianni", "ce9bdf21-c76c-55d6-b4fe-a6ba555b6982"),
    (9, "Uli Cazzaro", ""),
    (9, "Marco Döbeli", "5fc5f6c4-2883-5af7-9870-04d8c9378031"),
    (9, "Christoph Hitz", "7191ace0-3944-5433-85bb-6c80a6df482b"),
    (9, "Stephan Müller", ""),
    (9, "Ole Schnack", "246cf8ea-f186-5e7e-a781-3fc4205a702e"),
    (9, "Matthias Lino Schmidt", "f52e0fe8-4eff-5532-9af4-14124f1e92ee"),
    (9, "Phillip Schaefer", "1ef51b9d-a795-592e-8d0c-46184f784bf4"),
    (9, "Eric Dargent", "8878d71c-056c-5816-b35e-9d098d15253b"),
    (9, "Bogo Tamas", "5e0c75ed-7f3c-55c4-a9cf-5ca27269ee1a"),
    (9, "Andreas Wolff", "a03090dc-7534-5454-aab3-f3a074f67d33"),
    (9, "Chris Löw", "59b9b60b-1697-54f8-98d1-eaed43e99f65"),
    (9, "David Latotzky", "9ad767c1-172c-564c-97eb-fc8087b00f98"),
    (9, "Eduard Pinos", ""),
]

DIVISIONS = [
    Division("Intermediate Singles Net", "net", "complete", players(INTERMEDIATE_SINGLES_NET)),
    Division("Intermediate Doubles Net", "net", "complete", teams(INTERMEDIATE_DOUBLES_NET)),
    Division("Open Doubles Net", "net", "complete", teams(OPEN_DOUBLES_NET)),
    Division("Womens Open Frestyle", "freestyle", "complete", players(WOMENS_OPEN_FREESTYLE)),
    Division("Mens Open Freestyle", "freestyle", "complete", players(MENS_OPEN_FREESTYLE)),
]

if __name__ == "__main__":
    rebuild("981560223", "2001",
            {"Intermediate Singles Net": 4, "Intermediate Doubles Net": 1, "Open Doubles Net": 5,
             "Womens Open Frestyle": 7, "Mens Open Freestyle": 15},
            DIVISIONS)
