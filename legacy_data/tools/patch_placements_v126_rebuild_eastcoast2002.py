#!/usr/bin/env python3
"""
patch_placements_v126_rebuild_eastcoast2002.py

Rebuilds the 2002 East Coast Footbag Championships (event 1021665982) from the
final standings on its source page.

The page sets each discipline out as a table: "singles net", "doubles net" and
"judged style" each have one column per level, headed OPEN, INTERMEDIATE and NOVICE
(doubles net has no novice column), and a fourth table holds Phat Trick and
Rippinest Run side by side. Read as plain text the tables lose their columns, and
the lock had filed nearly every result under "Intermediate" or "Novice" with places
from different levels mixed together. It also held Rippinest Run's result under
Phat Trick: the Phat Trick column reads "WINNER: Scott Davidson / RunnerUp: Brad
Nelson", and the "1. Scott Bevier / 2. Scott Davidson" list is Rippinest Run's.

Each division here is one column of one table. Residence suffixes, nicknames in
quotes and the "(Novice Team)" note are not part of a name; "Flash" Gordon Scott
Bevier is Scott Bevier, nicknamed "Flash Gordon", as every open entrant in that
column carries a nickname. "JF" is a single word and is left unresolved.

Singles competitors are named by the id the lock already carried for them in this
event, otherwise by the id the shared alias resolver returns. Doubles teams are
team rows, which the export resolves member by member.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v126_rebuild_eastcoast2002.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, Team, rebuild  # noqa: E402

ID = {
    "Andrew Ronald": "760941c4-9426-56f1-ac79-e8ad3ce9cf98",
    "Bob Lavigne": "d41e4317-883b-5d0a-a05c-9601ab67dbce",
    "Chris Siebert": "bd1ac97c-6c20-5bcd-9fbd-f5279f4c22bf",
    "Stephane Comeau": "d7ee4909-a76d-5639-aa82-ce4a8a7a53ba",
    "James Harley": "84c14f8c-06df-54c2-a58b-545f5a970ce1",
    "Jamie Lepley": "3e46c4db-089a-55ed-a5ff-f0ce0ed793f3",
    "Vincent Bradley": "690c1f75-80d2-5cb6-ac67-a793f59e90fb",
    "Jeff Bowling": "a4083a97-d4c3-5aca-a315-7f25de92928e",
    "Anthony Intemann": "71ae4086-3d7f-5fdb-812b-778eda4da0cf",
    "Greg Nice Neumann": "cab98078-fdb2-557d-a5c9-799b41eb4f04",
    "Matt Quint": "66a19925-00c6-5da5-8b24-2bb656591603",
    "Theodore Fritsch": "738cbf71-ad21-598f-a5b3-afdb8bdf543d",
    "Jeremy Walters": "de3e9581-85a2-520b-92e5-d48c0d7f8bd2",
    "Jack Lentz": "57dca99e-db45-5b32-83f4-c188d1d24c50",
    "Ben Kellman": "edb7ff85-0dae-5590-b5df-ac61cd472031",
    "Dan Greer": "4e7dc073-b469-5740-821c-76e0ee26a3d1",
    "Drew Martin": "0b4b650a-3eae-53c0-aeb4-f5b47ca34cc6",
    "Brady Lambert": "11f694f4-ec41-5fad-8587-d276f7764b05",
    "James Wilson": "63aa8a79-8ce7-5112-9494-94de19408b29",
    "Matt Isanuk": "123465ba-8cc2-5c40-b728-e9863f2ea994",
    "Scott Miner": "cf2459ca-864c-581d-ab50-fa6d2e41c204",
    "Mike Clair": "3f4088a4-43b4-53fb-92ba-b349076b457d",
    "Jonathan Felix": "5fb5dad9-fea9-5d00-b248-0c99eded7fa6",
    "Peter Irish": "542be6a9-3b5a-5374-961b-9de19c0def7a",
    "Scott Davidson": "274d2f51-e2d5-5458-be40-6b9211ff813e",
    "Ken Somolinos": "d1aace44-cd92-5b85-9ed1-fe4afb2cd502",
    "Greg Nelson": "da2cbc95-e09b-5a22-9baf-00e25552c9b6",
    "Scott Bevier": "e1b0b026-9914-5ebb-8321-fe835ac96c25",
    "Adam Keith": "6c5e5fe4-c2d5-5d13-85df-1c751c10286e",
    "Jeremy Benton": "e5048c10-39e3-5f80-8b88-0512fb2d8089",
    "Valeria Davidson": "77d78830-84f5-520d-99d7-105a2b455eb3",
    "Bob Glasser": "c448d0ea-1fd7-5477-89bf-ef54258ab246",
    "Nino Almazon": "cecf97df-dde6-5289-b5ea-135792d7ae63",
    "Ben Scarborough": "00535124-269f-5de1-be41-94948cdae1c0",
    "Josh Benham": "ffa33e63-f63b-5a7b-ab85-1b6f65151734",
    "Mike Adamszyck": "e067a88d-7cee-55a1-8170-bd15d98e66f7",
    "Brad Nelson": "42cfb7b0-8f51-53ff-9721-f4ac4b909290",
}


def players(rows):
    return tuple(Player(place, name, ID.get(name, "")) for place, name in rows)


def teams(rows):
    return tuple(Team(place, pair) for place, pair in rows)


DIVISIONS = [
    Division("Open Singles Net", "net", "complete", players([
        (1, "Andrew Ronald"), (2, "Bob Lavigne"), (3, "JF"), (4, "Chris Siebert"),
        (5, "Stephane Comeau"), (6, "James Harley"), (7, "Jamie Lepley"), (8, "Vincent Bradley"),
        (9, "Jeff Bowling"), (10, "Anthony Intemann"), (10, "Greg Nice Neumann"), (10, "Matt Quint")])),
    Division("Intermediate Singles Net", "net", "complete", players([
        (1, "Theodore Fritsch"), (2, "Jeremy Walters"), (3, "Jack Lentz"), (4, "Ben Kellman")])),
    Division("Novice Singles Net", "net", "complete", players([
        (1, "Dan Greer"), (2, "Drew Martin"), (3, "Brady Lambert"), (4, "James Wilson"),
        (5, "Matt Isanuk"), (5, "Scott Miner"), (5, "Mike Clair"), (5, "Jonathan Felix")])),
    Division("Open Doubles Net", "net", "complete", teams([
        (1, ("Andy Ronald", "Bob Lavigne")), (2, ("Chris Seibert", "James Harley")),
        (3, ("Vincent Bradley", "Jamie Lepley")), (4, ("Jeff Bowling", "Matt Quint")),
        (5, ("JF", "Stephane Comeau")), (6, ("Anthony Intemann", "Greg Nice")),
        (7, ("Steve Goldberg", "Jeremy Walters")), (8, ("Jim Hankins", "Amy Noller"))])),
    Division("Intermediate Doubles Net", "net", "complete", teams([
        (1, ("Ted Fritsch", "Ben Kellman")), (2, ("Alison Smith", "Jeremy Walters")),
        (3, ("Jack Lentz", "Dan Greer")), (4, ("Matt Miller", "Drew Martin"))])),
    Division("Open Judged Style", "freestyle", "complete", players([
        (1, "Peter Irish"), (2, "Scott Davidson"), (3, "Ken Somolinos"), (4, "Greg Nelson"),
        (5, "Scott Bevier"), (6, "Adam Keith"), (7, "Jeremy Benton")])),
    Division("Intermediate Judged Style", "freestyle", "complete", players([
        (1, "Valeria Davidson"), (2, "Matt Isanuk"), (3, "Theodore Fritsch"), (4, "Bob Glasser"),
        (5, "Nino Almazon"), (6, "Ben Scarborough"), (7, "Josh Benham"), (8, "Mike Adamszyck")])),
    Division("Novice Judged Style", "freestyle", "complete", players([
        (1, "Dan Greer"), (2, "Ben Kellman"), (3, "Jonathan Felix"), (4, "Drew Martin")])),
    Division("Phat Trick", "freestyle", "complete", players([
        (1, "Scott Davidson"), (2, "Brad Nelson")])),
    Division("Rippinest Run", "freestyle", "complete", players([
        (1, "Scott Bevier"), (2, "Scott Davidson")])),
]

if __name__ == "__main__":
    rebuild("1021665982", "2002", {"Intermediate": 11, "Novice": 42, "Phat Trick": 2}, DIVISIONS)
