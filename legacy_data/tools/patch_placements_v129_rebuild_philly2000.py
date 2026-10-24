#!/usr/bin/env python3
"""
patch_placements_v129_rebuild_philly2000.py

Rebuilds the 2nd Annual Philly Open Footbag Championships (2000, event 947026077)
from the final standings on its source page.

The page gives Open, Intermediate and Novice sections, each with Freestyle, Singles
Net and Doubles Net, and a Big Combo contest whose lines name the competitor and the
combo they threw. The lock had merged the three levels into one division per
discipline, so three players shared each place, and had paired each Big Combo
competitor with their combo as a doubles team. Intermediate and novice net were run
combined, but the page ranks each level separately, and each ranking is carried as
its own division. Residence suffixes, the combo after each Big Combo name and the
"( 2nd overall )" note are not part of a name.

Competitors are named by the id the lock already carried for them in this event,
otherwise by the id the shared alias resolver returns. Doubles teams are team rows,
which the export resolves member by member.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v129_rebuild_philly2000.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, Team, rebuild  # noqa: E402

ID = {
    "Ken Somolinos": "d1aace44-cd92-5b85-9ed1-fe4afb2cd502",
    "Yacine Merzouk": "97d60d0e-3503-5814-8b1d-3fe6bb6bff86",
    "Sebastien Duchesne": "6dd904b7-11c6-5d62-af34-dad61040e67e",
    "Steve Smith": "6bddaecf-3335-5caf-ab0c-51a97fce26e2",
    "Jason Langis": "5141763c-285a-5f50-abd1-c5ef3b16ff0a",
    "Vincent Bradley": "690c1f75-80d2-5cb6-ac67-a793f59e90fb",
    "Marc Giard": "c7f3770c-6ebc-5e28-aeb0-c7913a67576f",
    "Matt Cross": "bc7525cb-8eb2-5cf2-a11e-1b072fede923",
    "Scott Bevier": "e1b0b026-9914-5ebb-8321-fe835ac96c25",
    "Mark Hunsburger": "6f08080b-9aad-54de-afc5-1c6e553f6a6e",
    "Dan Kramer": "38ace662-7295-5be2-a71f-add24991ad14",
    "Lovell McIlwain": "4c7947f7-ea00-5a60-9cba-75320e70623d",
    "Alex Faber": "16b2083f-d41a-5944-8669-d41494e21159",
    "Ara Bagdassurian": "ba1e5566-8046-5eea-8672-06652ca3cb64",
    "Jake Milofsky": "0f51c65d-c889-5354-8cb7-21bef31c04ca",
    "Jeremy Walters": "de3e9581-85a2-520b-92e5-d48c0d7f8bd2",
    "Amy Noller": "ecf5bb08-8088-5a0d-b236-3eb837afc74e",
    "Rob Adams": "20d639b1-087f-5227-9eaa-6dd342d57439",
}


def ranked(*names):
    return tuple(Player(i, n, ID[n]) for i, n in enumerate(names, 1))


def pairs(*teams):
    return tuple(Team(i, t) for i, t in enumerate(teams, 1))


DIVISIONS = [
    Division("Big Combo", "freestyle", "complete",
             ranked("Ken Somolinos", "Yacine Merzouk", "Sebastien Duchesne")),
    Division("Open Freestyle", "freestyle", "complete",
             ranked("Ken Somolinos", "Sebastien Duchesne", "Yacine Merzouk")),
    Division("Open Singles Net", "net", "complete",
             ranked("Steve Smith", "Jason Langis", "Vincent Bradley")),
    Division("Open Doubles Net", "net", "complete", pairs(
        ("Steve Smith", "Cory Current"), ("Vincent Bradley", "Jeff Bowling"),
        ("Jason Langis", "Matt Quint"))),
    Division("Intermediate Freestyle", "freestyle", "complete",
             ranked("Marc Giard", "Matt Cross", "Scott Bevier")),
    Division("Intermediate Singles Net", "net", "complete",
             ranked("Mark Hunsburger", "Dan Kramer", "Lovell McIlwain")),
    Division("Intermediate Doubles Net", "net", "complete", pairs(
        ("Lovell McIlwain", "Justin Wright"), ("Mark Hunsberger", "Jeremy Walters"),
        ("Dan Kramer", "Amy Noller"))),
    Division("Novice Freestyle", "freestyle", "complete",
             ranked("Alex Faber", "Ara Bagdassurian", "Jake Milofsky")),
    Division("Novice Singles Net", "net", "complete",
             ranked("Jeremy Walters", "Amy Noller", "Rob Adams")),
    Division("Novice Doubles Net", "net", "complete", pairs(
        ("Ken Somolinos", "Yacine Merzouk"), ("Ray Adams", "Jake Milofsky"))),
]

if __name__ == "__main__":
    rebuild("947026077", "2000",
            {"Big Combo": 3, "Doubles Net": 8, "Freestyle": 9, "Singles Net": 9}, DIVISIONS)
