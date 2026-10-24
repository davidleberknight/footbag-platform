#!/usr/bin/env python3
"""
patch_placements_v125_rebuild_french2011_net.py

Rebuilds the net divisions of the French Footbag Championships 2011 (event
1305581560) from the final standings on its source page.

The page lists Singles Net's final standings and then its initial seeding, and
Doubles Net's final standings and then its seeding. The lock filed all four lists
under "Singles Net", doubles teams included, so most players held several places,
and it had no Doubles Net division. Only the two final lists are carried:

  Singles Net  1 Ledain .. 19 Jouvenel
  Doubles Net  1 Tellenbach / Landau .. 10 Vincendeau / Nantes

Freesytle Routine already matches the page and is not touched.

Singles competitors are named by the id the lock already carried for them in this
event, otherwise by the id the shared alias resolver returns. Doubles teams are
team rows, which the export resolves member by member.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v125_rebuild_french2011_net.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, Team, rebuild  # noqa: E402

SINGLES = [
    ("Arthur Ledain", "e528ca88-e462-5870-bd7f-45fb49bfbcfc"),
    ("Sébastien Maillet", "a9518594-35d9-53cd-8e8d-a7bc4de94236"),
    ("Lino Landau", "fbf52ca9-ba84-50bc-bce9-0244718c18e7"),
    ("Mouss Kabbal", "897d9022-b9cd-5d56-b9c8-19d31f38b5a7"),
    ("Grischa Tellenbach", "ec1d5118-cd4b-591f-a84a-04bbe20868bc"),
    ("Guillaume Degat", "dad697e8-36ed-598e-84b3-8105a2868685"),
    ("Fabien Riffaud", "9337337c-b3c1-53a6-9f38-ee3923ef6c13"),
    ("Sven Depoilly", "989e4bf9-b2ab-526c-bd1e-a09ebe6411aa"),
    ("Vincent Rousseau", "b5c82731-ff37-5170-86a5-f744afe4d154"),
    ("Olivier Baillon", "42492045-f1bf-5183-82c0-fedee3941a1e"),
    ("Marc Brunet", "a5c9d383-777c-5f21-9604-6fd1cba79fb4"),
    ("Quentin Isackson", "7d094f73-d2d9-5f99-9b73-6593696c90ef"),
    ("David Rambaud", "9dd1729e-cd7f-5412-93ee-f08166e75fc7"),
    ("Thomas Sustrac", "a0bcdd4a-2d77-522f-8f5c-b74c30ade8d2"),
    ("Mael Le Gall", "e3de11aa-d25a-509d-ba0f-11b14f609cb6"),
    ("Boris Ollivier", "7150e55f-c6bd-5d27-a08b-9617313cac5e"),
    ("Nicolas Janin", "4e6f43e2-e696-59ca-81f1-8f45729a2df4"),
    ("Wilfried Vincendeau", "d9e7e9d3-e3fd-5939-a7eb-a937552d1b6b"),
    ("Bruno Jouvenel", "c996a805-5b30-5a45-ba59-479a1426a772"),
]

DOUBLES = [
    ("Grischa Tellenbach", "Lino Landau"), ("Arthur Ledain", "Quentin Isackson"),
    ("Mouss Kabbal", "Sebastien Maillet"), ("Marc Brunet", "Vincent Rousseau"),
    ("Guillaume Degat", "Sven Depoilly"), ("Thomas Sustrac", "Olivier Baillon"),
    ("Fabien Riffaud", "Emmanuelle Bouvier"), ("Emilien Groussin", "Clement Gobe"),
    ("David Rambaud", "Maël LeGall"), ("Wilfrid Vincendeau", "Nicolas Nantes"),
]

DIVISIONS = [
    Division("Singles Net", "net", "complete",
             tuple(Player(i, name, pid) for i, (name, pid) in enumerate(SINGLES, 1))),
    Division("Doubles Net", "net", "complete",
             tuple(Team(i, pair) for i, pair in enumerate(DOUBLES, 1))),
]

if __name__ == "__main__":
    rebuild("1305581560", "2011", {"Singles Net": 38}, DIVISIONS)
