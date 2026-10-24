#!/usr/bin/env python3
"""
patch_placements_v122_rebuild_rnh2010.py

Rebuilds the two divisions of RNH Contest 2010 (event 1270631935) from the final
standings on its source page.

The page lists each discipline's seeding, pool tables, match scores and
consolation rounds before its final standings ("Final results" for doubles,
"Complete Results" for singles). The lock had taken placements from all of them,
so several teams and players held more than one place and five singles players
shared first. Only the final standings are carried; the change-from-seeding marks
beside each line ("(+4)") are not part of a name.

  Open Doubles Net  1 Lemieux / Lima .. 10 Sustrac / Kaufmann
  Open Singles Net  1 Daouk .. 17 Amengual

Singles competitors are named by the id the lock already carried for them in this
event, otherwise by the id the shared alias resolver returns. Doubles teams are
team rows, which the export resolves member by member.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v122_rebuild_rnh2010.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lock_division_rebuild import Division, Player, Team, rebuild  # noqa: E402

DOUBLES = [
    ("JF Lemieux", "Greg Lima"), ("Grischa Tellenbach", "Lino Landau"),
    ("Karim Daouk", "Tammo Rockel"), ("Sebastien Maillet", "Mouss Kabbal"),
    ("Amaya Straeten", "Jonas Thull"), ("Yves Kreil", "Arthur Ledain"),
    ("Hakan Hellberg", "Vincent Rousseau"), ("Yves Mingard", "Justin Eichenlaub"),
    ("Olivier Baillon", "Arnaud Saniez"), ("Thomas Sustrac", "David Kaufmann"),
]

SINGLES = [
    ("Karim Daouk", "eb025239-b9ab-5cef-9307-7639f88a225a"),
    ("Yves Kreil", "b274fbcc-9283-5e2e-9c68-704f3212796e"),
    ("Greg Lima", "c7a23f15-f2ed-5f2b-ac50-bb1adb185475"),
    ("Lino Landau", "fbf52ca9-ba84-50bc-bce9-0244718c18e7"),
    ("Arthur Ledain", "e528ca88-e462-5870-bd7f-45fb49bfbcfc"),
    ("Amaya Straeten", "6e1b0db3-cea0-598f-a6a4-b099fe5c8161"),
    ("Sébastien Maillet", "a9518594-35d9-53cd-8e8d-a7bc4de94236"),
    ("Grischa Tellenbach", "ec1d5118-cd4b-591f-a84a-04bbe20868bc"),
    ("Hakan Hellberg", "1a1b1397-a4b8-5826-b51d-ff5391eba110"),
    ("Mouss Kabbal", "897d9022-b9cd-5d56-b9c8-19d31f38b5a7"),
    ("Tammo Rockel", "ecf4cab4-a4f2-549d-85fb-5d8528db3948"),
    ("Justin Eichenlaub", "c476f406-2f03-5f67-88aa-f90dcc36ac42"),
    ("Vincent Rousseau", "b5c82731-ff37-5170-86a5-f744afe4d154"),
    ("Thomas Sustrac", "a0bcdd4a-2d77-522f-8f5c-b74c30ade8d2"),
    ("Yves Mingard", "c4f49339-ef54-500b-bedc-3e3ae2e081e1"),
    ("Jonas Thoell", "f11d8cfd-276b-57fd-ae34-1f9345931683"),
    ("Lisa Amenguale", "04f32be4-d341-5f17-b5e4-23df053befff"),
]

DIVISIONS = [
    Division("Open Doubles Net", "net", "complete",
             tuple(Team(i, pair) for i, pair in enumerate(DOUBLES, 1))),
    Division("Open Singles Net", "net", "complete",
             tuple(Player(i, name, pid) for i, (name, pid) in enumerate(SINGLES, 1))),
]

if __name__ == "__main__":
    rebuild("1270631935", "2010", {"Open Doubles Net": 21, "Open Singles Net": 29}, DIVISIONS)
