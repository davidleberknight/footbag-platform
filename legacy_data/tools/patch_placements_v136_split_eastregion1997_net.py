#!/usr/bin/env python3
"""
patch_placements_v136_split_eastregion1997_net.py

Splits the intermediate and novice net divisions of the 15th East Coast Footbag
Championships 1997 (event 857879540) apart, from its source page.

The page lists its intermediate contests under "INTERMEDIATE:" and its novice
contests under "Novice Category", each with its own "Singles Net" and "Doubles
Net" list. The lock filed both levels under the bare headings, so "Singles Net"
held two players at every place and was then retagged as doubles, and "Doubles
Net" held two teams at places 1 and 3, a stray player at places 2 and 3, and no
Sunil Jani and Vijay team at all.

The rebuilt rows are the page's four lists:
  Intermediate Singles Net  1 Toxic Tom B.  2 Anthony Intemann  3 Jamie Lepley
  Novice Singles Net        1 John Mortensen  2 Josh Penney  3 Lonn Vo
  Intermediate Doubles Net  1 Lepley / Garth Smith .. 3 Jim Hankin / Toxic Tom B.
  Novice Doubles Net        1 Mortensen / Lonn Vo .. 3 Stuart Roll / Chris H.

Singles competitors are named by the id the lock already carried for them in
this event. Doubles teams are team rows, which the export resolves member by
member; the page names one partner only as "Vijay", and that name stays as given.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v136_split_eastregion1997_net.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, Team, rebuild  # noqa: E402

TOXIC_TOM = ("Toxic Tom B.", "f770d567-8f0b-5891-ae6f-4e1412a2227d")
INTEMANN = ("Anthony Intemann", "71ae4086-3d7f-5fdb-812b-778eda4da0cf")
LEPLEY = ("Jamie Lepley", "3e46c4db-089a-55ed-a5ff-f0ce0ed793f3")
MORTENSEN = ("John Mortensen", "79665d43-fc4f-5484-9f76-92c81c16ee10")
PENNEY = ("Josh Penney", "ffb44633-32b2-5794-8239-1e20e2c68e23")
VO = ("Lonn Vo", "cf4f814b-253e-580b-8010-f510ff168777")


def singles(name: str, *players: tuple[str, str]) -> Division:
    return Division(name, "net", "complete", tuple(
        Player(place, n, pid) for place, (n, pid) in enumerate(players, start=1)))


def doubles(name: str, *pairs: tuple[str, str]) -> Division:
    return Division(name, "net", "complete", tuple(
        Team(place, pair) for place, pair in enumerate(pairs, start=1)))


DIVISIONS = [
    singles("Intermediate Singles Net", TOXIC_TOM, INTEMANN, LEPLEY),
    singles("Novice Singles Net", MORTENSEN, PENNEY, VO),
    doubles("Intermediate Doubles Net",
            ("Jamie Lepley", "Garth Smith"), ("Ann Lasken", "Matt Quint"),
            ("Jim Hankin", "Toxic Tom B.")),
    doubles("Novice Doubles Net",
            ("John Mortensen", "Lonn Vo"), ("Sunil Jani", "Vijay"),
            ("Stuart Roll", "Chris H.")),
]

if __name__ == "__main__":
    rebuild("857879540", "1997", {"Singles Net": 6, "Doubles Net": 7}, DIVISIONS)
