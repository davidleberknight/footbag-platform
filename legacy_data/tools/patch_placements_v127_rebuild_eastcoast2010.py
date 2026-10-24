#!/usr/bin/env python3
"""
patch_placements_v127_rebuild_eastcoast2010.py

Rebuilds the 2010 East Coast Footbag Championships (event 1268407783) from the
final standings on its source page.

The page's manual results table gives each contest a block with one column per
level: routines (open), circle (open, intermediate), big3 (open, intermediate),
single's net (open, intermediate, novice) and double's net (open, intermediate).
The page's structured results block repeats the three open freestyle contests and
agrees with the table. Read as plain text the table loses its headings, and the
lock had filed every result under "Open", "Intermediate" or "Novice" with contests
mixed together, so players held several places in one division.

Each division here is one column of one block, named as the structured block names
the open freestyle contests. Several net columns number a place with no name beside
it ("3.", "4.", "5."); those places are not carried, as no one is recorded in them.
A place number on its own line belongs to the name on the next line, and an empty
"()" is nothing. Residence suffixes are not part of a name.

Competitors are named by the id the lock already carried for them in this event,
otherwise by the id the shared alias resolver returns. Doubles teams are team rows,
which the export resolves member by member.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v127_rebuild_eastcoast2010.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, Team, rebuild  # noqa: E402

ID = {
    "David Clavens": "033a8589-0c98-5729-a8b4-068c4efcf025",
    "Daryl Genz": "bd97ebe2-5ecd-5854-9d2e-b877a27ac527",
    "Ryan Thomas": "8519ad8c-7103-5eee-97c4-a08a9895da57",
    "John Goode": "395b8759-8094-5a10-90e3-5d30981ae02d",
    "Dan Greer": "4e7dc073-b469-5740-821c-76e0ee26a3d1",
    "Drew Martin": "0b4b650a-3eae-53c0-aeb4-f5b47ca34cc6",
    "Aric McIntosh": "a9cb54c3-9f91-563a-a953-4de8dda05ffe",
    "Steve Cline": "6f5650e6-0134-57af-8400-e9c3ce72e333",
    "Barrett Neimeth": "138a36ab-c52b-5757-827d-766589129128",
    "Mike Angeski": "a1bf327a-360f-540b-984a-1aea60c9e51e",
    "Mark Bull": "a4f4561b-b698-5824-b728-a7dee727674a",
    "Vincent Bradley": "690c1f75-80d2-5cb6-ac67-a793f59e90fb",
    "Mark Hunsburger": "6f08080b-9aad-54de-afc5-1c6e553f6a6e",
    "Jack Lentz": "57dca99e-db45-5b32-83f4-c188d1d24c50",
    "Dan Johnson": "c09000c8-1fae-5bdb-90cf-a3a1a3b8e4be",
    "Chris Balch": "e8aa88b0-f630-555a-ac0c-60d033607464",
    "Kolya Moyer": "cba5f203-2db7-5cfe-a180-c55f7f374f5e",
    "Patrick Neary": "8c248e81-181c-50b5-a4c9-abb672064944",
    "Nick Pollini": "62344062-d3a4-56d5-bc8d-0ce8612be463",
    "Noah Hunsberger": "905e83f1-afb6-5bea-a585-9c6677034520",
    "Jesska Langrehr": "107d24ce-9867-5353-bdd8-11f5373b4923",
    "Andrew Barnhart": "e8c7e46d-e874-540d-803b-488ed9d80da5",
    "Steven Riggs": "c26daa7b-e4b4-564e-86c3-19ca3b8c29b7",
    "Nick Greives": "b7279493-eeb5-5a16-a001-ae0b2af5dd7a",
}


def players(rows):
    return tuple(Player(place, name, ID[name]) for place, name in rows)


DIVISIONS = [
    Division("Open Singles Routines", "freestyle", "complete", players([
        (1, "David Clavens"), (2, "Daryl Genz"), (3, "Ryan Thomas"), (4, "John Goode"),
        (5, "Dan Greer"), (6, "Drew Martin")])),
    Division("Open Circle Contest", "freestyle", "complete", players([
        (1, "David Clavens"), (2, "Aric McIntosh"), (3, "Ryan Thomas"), (4, "Dan Greer"),
        (5, "Daryl Genz"), (5, "Drew Martin"), (7, "John Goode"), (7, "Steve Cline")])),
    Division("Intermediate Circle Contest", "freestyle", "complete", players([
        (1, "Barrett Neimeth"), (2, "Mike Angeski"), (3, "Mark Bull")])),
    Division("Open Sick 3-Trick", "freestyle", "complete", players([
        (1, "David Clavens"), (2, "Ryan Thomas"), (3, "Aric McIntosh"), (4, "Drew Martin"),
        (5, "John Goode"), (6, "Daryl Genz"), (7, "Dan Greer")])),
    Division("Intermediate Sick 3-Trick", "freestyle", "complete", players([
        (1, "Mark Bull")])),
    Division("Open Singles Net", "net", "complete", players([
        (1, "Vincent Bradley"), (2, "Dan Greer"), (3, "Mark Hunsburger"), (4, "Ryan Thomas"),
        (5, "Jack Lentz"), (6, "Aric McIntosh")])),
    Division("Intermediate Singles Net", "net", "complete", players([
        (1, "Ryan Thomas"), (2, "Dan Johnson"), (5, "Aric McIntosh"), (6, "Chris Balch")])),
    Division("Novice Singles Net", "net", "complete", players([
        (1, "Kolya Moyer"), (2, "Patrick Neary"), (3, "Nick Pollini"), (4, "Noah Hunsberger"),
        (5, "Jesska Langrehr"), (5, "Andrew Barnhart"), (7, "Steven Riggs"), (7, "Nick Greives")])),
    Division("Open Doubles Net", "net", "complete", (
        Team(1, ("Vincent Bradley", "Dan Greer")), Team(2, ("Jim Hankins", "Greg Nice")))),
    Division("Intermediate Doubles Net", "net", "complete", (
        Team(1, ("Ryan Thomas", "Chris Balch")),)),
]

if __name__ == "__main__":
    rebuild("1268407783", "2010", {"Intermediate": 20, "Novice": 18, "Open": 6}, DIVISIONS)
