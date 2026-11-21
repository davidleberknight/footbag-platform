#!/usr/bin/env python3
"""
patch_placements_v137_split_eastregion2008_net.py

Splits the open and intermediate net divisions of the East Coast Footbag
Championships 2008 (event 1220466807) apart, from its source page.

The page sets its results in a two-column table headed "open" and
"intermediate", each column with its own "singles net" and "doubles net" list.
The lock merged the columns by place, so "Singles Net" held two players at every
place and was then retagged as doubles, and "Doubles Net" held two teams at
places 1 and 2.

The rebuilt rows are the page's four lists:
  Open Singles Net          1 Jamie Lepley .. 8 Vincent Bradley
  Intermediate Singles Net  1 Ted Fritsch .. 9 Andrew Bohlin
  Open Doubles Net          1 Lepley / Greer .. 4 Hankins / Kellman
  Intermediate Doubles Net  1 Fritsch / Hunsberger, 2 Lentz / Norrod,
                            5 Dukes / Dukes, 6 Neimeth / Johnson

The page marks Vincent Bradley "(withdrew)" at 8th and keeps him at that place,
so the place stays. It leaves intermediate doubles 3rd and 4th blank, and a blank
place stays blank.

Singles competitors are named by the id the lock already carried for them in
this event, under the canon of that record. Doubles teams are team rows, which
the export resolves member by member.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_placements_v137_split_eastregion2008_net.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, Team, rebuild  # noqa: E402

OPEN_SINGLES = [
    ("Jamie Lepley", "3e46c4db-089a-55ed-a5ff-f0ce0ed793f3"),
    ("Erroll Stryker", "c256196e-aeb4-5011-9dce-81719a307619"),
    ("Dan Greer", "4e7dc073-b469-5740-821c-76e0ee26a3d1"),
    ("Anthony Intemann", "71ae4086-3d7f-5fdb-812b-778eda4da0cf"),
    ("Greg Nice Neumann", "cab98078-fdb2-557d-a5c9-799b41eb4f04"),
    ("Kevin Fura", "b1ea8da1-6ee8-52a3-8d9f-137d6ced1521"),
    ("Jim Hankins", "61656316-f92f-5235-a6fd-e3218d5601f8"),
    ("Vincent Bradley", "690c1f75-80d2-5cb6-ac67-a793f59e90fb"),
]

INTERMEDIATE_SINGLES = [
    ("Theodore Fritsch", "738cbf71-ad21-598f-a5b3-afdb8bdf543d"),
    ("Mark Hunsburger", "6f08080b-9aad-54de-afc5-1c6e553f6a6e"),
    ("Jack Lentz", "57dca99e-db45-5b32-83f4-c188d1d24c50"),
    ("Matt Evans", "19c11d95-82bd-502b-8c8f-1ebffa8bbb44"),
    ("Phil Norrod", "b417c6be-4655-5e10-98ba-bc3c06552892"),
    ("Jason Bohlin", "98bd269f-cafd-5f28-b02c-71ad0a6fd0e5"),
    ("Dan Johnson", "c09000c8-1fae-5bdb-90cf-a3a1a3b8e4be"),
    ("Mark Daniels", "33e83366-7b1e-5c4a-99a9-8eba0d3988ca"),
    ("Andrew Bohlin", "47154f87-aba0-517d-bea8-7b1c1dcc6faf"),
]

OPEN_DOUBLES = [
    (1, ("Jamie Lepley", "Dan Greer")),
    (2, ("Erroll Stryker", "Greg Neumann")),
    (3, ("Anthony Intemann", "Vincent Bradley")),
    (4, ("Jim Hankins", "Benjamin Kellman")),
]

INTERMEDIATE_DOUBLES = [
    (1, ("Ted Fritsch", "Mark Hunsberger")),
    (2, ("Jack Lentz", "Phil Norrod")),
    (5, ("Adrienne Dukes", "Charlie Dukes")),
    (6, ("Barrett Neimeth", "Dan Johnson")),
]

DIVISIONS = [
    Division("Open Singles Net", "net", "complete",
             tuple(Player(i, n, pid) for i, (n, pid) in enumerate(OPEN_SINGLES, 1))),
    Division("Intermediate Singles Net", "net", "complete",
             tuple(Player(i, n, pid) for i, (n, pid) in enumerate(INTERMEDIATE_SINGLES, 1))),
    Division("Open Doubles Net", "net", "complete",
             tuple(Team(place, pair) for place, pair in OPEN_DOUBLES)),
    Division("Intermediate Doubles Net", "net", "complete",
             tuple(Team(place, pair) for place, pair in INTERMEDIATE_DOUBLES)),
]

if __name__ == "__main__":
    rebuild("1220466807", "2008", {"Singles Net": 17, "Doubles Net": 8}, DIVISIONS)
