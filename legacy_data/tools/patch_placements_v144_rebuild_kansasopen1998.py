#!/usr/bin/env python3
"""
patch_placements_v144_rebuild_kansasopen1998.py

Rebuilds the results of the Kansas Footbag Open 1998 (event 892446131) from its
source page.

The page is a newspaper listing of fourteen contests, each split into Novice,
Intermediate and Pro. Its words break across lines with a hyphen ("Mike Voght-
mann", "Brian McK- ensie"), and a winner is often given without "1.". The lock
kept only three golf lists, each merged with players of other contests and of the
broken names ("Brian McK", "Mike Voght"), and a "Doubles Consecutive" division
whose only rows are the heading "10-Minute timed".

The rebuilt rows are the page's lists:
  Novice 5-Minute Timed Consecutives        1 Alan Moffett
  Intermediate 5-Minute Timed Consecutives  1 Josh Bowen, 2 Romie Williams,
                                            3 Noah Wilson
  Pro 5-Minute Timed Consecutives           1 Brian McKenzie, 2 Steve Smith
  Intermediate Doubles 10-Minute Timed Consecutives
                                            1 Williams / Bowen, 2 Voghtmann / Tandlyn
  Pro Doubles 10-Minute Timed Consecutives  1 Smith / McKenzie
  Intermediate Singles Net                  1 Mike Voghtmann, 2 Ryan Tandlyn,
                                            3 Glenn Hadaway
  Pro Singles Net                           1 Steve Smith, 2 Davie Piper
  Intermediate Doubles Net                  1 Voghtmann / Tandlyn,
                                            2 Hadaway / Carlton, 3 Duster / McMurray
  Pro Doubles Net                           1 Smith / Piper
  Intermediate Freestyle                    1 Josh Bowen, 2 James Widman,
                                            3 Mike Voghtmann
  Pro Freestyle                             1 Brian McKenzie, 2 Steve Smith
  Intermediate Doubles Freestyle            1 McKenzie / Winger, 2 Foster / Bowen,
                                            3 Reeves / Denser
  Novice (golf)                             1 Heather Van Hoesen
  Intermediate (golf)                       1 Jason Buster, 2 Mike Voghtmann,
                                            3 James Widman
  Pro (golf)                                1 Steve Smith, 2 Eric Nielsen,
                                            3 Davie Piper

The golf lists keep their names, so the discipline fix and team corrections keyed
on them still apply. The "Unknown" division (the page header read as a player)
is left as it is; a quarantine rule removes it.

A player with a persons-truth record of the same name is named by that id. Mike
Voghtmann is the record the lock made from the broken "Mike Voght", and is named
under that record's canon. Brian McKenzie of Hebron, Neb., written "Brian McK-
ensie" in doubles freestyle, is named by his canon. Every other player has no
record and is left unresolved, written as the page spells the name.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v144_rebuild_kansasopen1998.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, Team, rebuild  # noqa: E402

BOWEN = ("Josh Bowen", "bf06af8d-8efa-5d80-aa6e-44a2e6b2ac12")
WILLIAMS = ("Romie Williams", "3ac917ba-49ff-514c-a2ea-f61971b08e72")
WILSON = ("Noah Wilson", "5176d834-f522-5281-b627-3ab2fe8cf644")
MCKENZIE = ("Brian McKenzie", "0c7a541a-eae6-5ffc-9b9b-3ff86bf3941c")
SMITH = ("Steve Smith", "6bddaecf-3335-5caf-ab0c-51a97fce26e2")
VOGHT = ("Mike Voght", "6c446ce1-36c9-5214-ae97-07dfc778baeb")
PIPER = ("Davie Piper", "58cb9eef-615d-513d-9851-834e6c26b416")
WIDMAN = ("James Widman", "9f055ac3-278a-5340-b834-0690fe6e85aa")
BUSTER = ("Jason Buster", "201230dd-7bcc-5347-9439-c8b42e9c4ca8")
VAN_HOESEN = ("Heather Van Hoesen", "737c677f-3150-5e10-8fcb-51e536b47bed")
MOFFETT = ("Alan Moffett", "")
TANDLYN = ("Ryan Tandlyn", "")
HADAWAY = ("Glenn Hadaway", "")
NIELSEN = ("Eric Nielsen", "")


def listing(*players):
    return tuple(Player(i, n, pid) for i, (n, pid) in enumerate(players, 1))


def teams(*pairs):
    return tuple(Team(i, pair) for i, pair in enumerate(pairs, 1))


DIVISIONS = [
    Division("Novice 5-Minute Timed Consecutives", "sideline", "complete",
             listing(MOFFETT)),
    Division("Intermediate 5-Minute Timed Consecutives", "sideline", "complete",
             listing(BOWEN, WILLIAMS, WILSON)),
    Division("Pro 5-Minute Timed Consecutives", "sideline", "complete",
             listing(MCKENZIE, SMITH)),
    Division("Intermediate Doubles 10-Minute Timed Consecutives", "sideline", "complete",
             teams(("Romie Williams", "Josh Bowen"), ("Mike Voght", "Ryan Tandlyn"))),
    Division("Pro Doubles 10-Minute Timed Consecutives", "sideline", "complete",
             teams(("Steve Smith", "Brian McKenzie"))),
    Division("Intermediate Singles Net", "net", "complete",
             listing(VOGHT, TANDLYN, HADAWAY)),
    Division("Pro Singles Net", "net", "complete", listing(SMITH, PIPER)),
    Division("Intermediate Doubles Net", "net", "complete",
             teams(("Mike Voght", "Ryan Tandlyn"), ("Glenn Hadaway", "Rich Carlton"),
                   ("Jason Duster", "Angee McMurray"))),
    Division("Pro Doubles Net", "net", "complete", teams(("Steve Smith", "Davie Piper"))),
    Division("Intermediate Freestyle", "freestyle", "complete",
             listing(BOWEN, WIDMAN, VOGHT)),
    Division("Pro Freestyle", "freestyle", "complete", listing(MCKENZIE, SMITH)),
    Division("Intermediate Doubles Freestyle", "freestyle", "complete",
             teams(("Brian McKenzie", "Sean Winger"), ("Lisa Foster", "Josh Bowen"),
                   ("Zach Reeves", "Tom Denser"))),
    Division("Novice", "golf", "complete", listing(VAN_HOESEN)),
    Division("Intermediate", "golf", "complete", listing(BUSTER, VOGHT, WIDMAN)),
    Division("Pro", "golf", "complete", listing(SMITH, NIELSEN, PIPER)),
]

if __name__ == "__main__":
    rebuild("892446131", "1998",
            {"Doubles Consecutive": 2, "Intermediate": 5, "Novice": 1, "Pro": 1},
            DIVISIONS)
