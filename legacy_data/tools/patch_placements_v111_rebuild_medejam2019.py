#!/usr/bin/env python3
"""
patch_placements_v111_rebuild_medejam2019.py

Rebuilds the frozen placements of MedeJam de Footbag 2019 (Medellín, event
1568692191) from its source page.

The source lists four contests under Spanish headings. The lock carried the
parser's misreading of them:
  - the net singles list ("FOOTBAG NET OPEN INDIVIDUAL") as an unnamed division;
  - the net doubles pairs shifted by one line, so every team was wrong, one
    player was missing and three slots held no person;
  - the freestyle results filed under trick names ("Smog (Pixie Doble Leg
    Over) / ...", "Smudge /Eggbeater/..."), with the Big One contest missing and
    Sick 3 holding only its winner.

The rebuilt rows, from the source text:
  Open Singles Net  1 Cardozo, 2 Florez, 3 Palacios, 4 Almanza, 5 C. Ramirez,
                    6 Restrepo, 7 Ceballos, 8 G. Ramirez
  Open Doubles Net  1 Almanza / Florez, 2 Restrepo / Palacios,
                    3 Cardozo / Linero, 4 C. Ramirez / Palomino
  Freestyle Big One 1 Linero, 2 C. Ramirez, 3 G. Ramirez (trick not completed)
  Sick 3            1 G. Ramirez, 2 Linero, 3 C. Ramirez

Every person already has a record; each is named by id with its canon asserted.
The event's 18 rows are replaced by 18 rows; no other row is touched.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v111_rebuild_medejam2019.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCK = ROOT / "inputs" / "identity_lock"
PB_IN = LOCK / "Placements_ByPerson.csv"
PB_OUT = LOCK / "Placements_ByPerson_v111.csv"
PT = LOCK / "Persons_Truth_Final.csv"

EVENT_ID = "1568692191"
YEAR = "2019"
EXPECTED_OLD_ROWS = 18

P = {
    "cardozo": ("ccbb4b15-2d0f-5982-8801-9e891ad3205a", "Reinaldo Cardozo"),
    "florez": ("f5f6f800-86d2-51ae-954a-4b6b292674d4", "Julian Florez Cifuentes"),
    "palacios": ("3123701a-43bd-5273-8472-ba332dc67fed", "Juan Bernardo Palacios Lemos"),
    "almanza": ("c7d606bd-4757-5779-9aea-33313bdb27fb", "Gianni Almanza Amaya"),
    "c_ramirez": ("cb047679-c1ef-5ab8-8944-999ca66d1ea3", "Carlos Ramirez"),
    "restrepo": ("bccd6d14-b132-5b0c-83bd-8eb8299409a2", "Esteban Restrepo"),
    "ceballos": ("ef2c88aa-ab9e-58d1-b4c9-1374e77859eb", "Sebastian Ceballos"),
    "g_ramirez": ("dc18b43c-4679-577c-8411-3c7134e59f91", "Guillermo Ramirez"),
    "linero": ("da631353-0d65-5a29-9572-37f115385c15", "Antonio Linero Castro"),
    "palomino": ("466ed7b5-b107-5e4c-9c44-8f8474773d97", "Juan David Palomino Mosquera"),
}

SINGLES = [
    ("Open Singles Net", "net", ["cardozo", "florez", "palacios", "almanza",
                                 "c_ramirez", "restrepo", "ceballos", "g_ramirez"]),
    # Named with its family: a bare "Big One" beside the net contests would be
    # read as a net division by the remediation step.
    ("Freestyle Big One", "freestyle", ["linero", "c_ramirez", "g_ramirez"]),
    ("Sick 3", "freestyle", ["g_ramirez", "linero", "c_ramirez"]),
]
DOUBLES = ("Open Doubles Net", "net", [("almanza", "florez"), ("restrepo", "palacios"),
                                       ("cardozo", "linero"), ("c_ramirez", "palomino")])


def _row(fields: list[str], **values: str) -> dict[str, str]:
    r = {f: "" for f in fields}
    r.update(event_id=EVENT_ID, year=YEAR, coverage_flag="complete", **values)
    return r


def build(fields: list[str]) -> list[dict[str, str]]:
    out = []
    for division, category, order in SINGLES[:1]:
        for place, key in enumerate(order, start=1):
            pid, canon = P[key]
            out.append(_row(fields, division_canon=division, division_category=category,
                            place=str(place), competitor_type="player", person_id=pid,
                            person_canon=canon, norm=canon.lower()))
    division, category, pairs = DOUBLES
    for place, (a, b) in enumerate(pairs, start=1):
        key = "|".join(sorted([P[a][0], P[b][0]]))
        out.append(_row(fields, division_canon=division, division_category=category,
                        place=str(place), competitor_type="team", team_person_key=key,
                        person_canon="__NON_PERSON__",
                        team_display_name=f"{P[a][1]} / {P[b][1]}"))
    for division, category, order in SINGLES[1:]:
        for place, key in enumerate(order, start=1):
            pid, canon = P[key]
            out.append(_row(fields, division_canon=division, division_category=category,
                            place=str(place), competitor_type="player", person_id=pid,
                            person_canon=canon, norm=canon.lower()))
    return out


def main() -> None:
    with open(PT, newline="", encoding="utf-8") as f:
        canon_of = {r["effective_person_id"]: r["person_canon"] for r in csv.DictReader(f)}
    for key, (pid, canon) in P.items():
        if canon_of.get(pid) != canon:
            raise AssertionError(f"{key}: person {pid} is {canon_of.get(pid)!r}, expected {canon!r}")

    with open(PB_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fields = list(reader.fieldnames or [])
        rows = list(reader)
    n_in = len(rows)
    idx = [i for i, r in enumerate(rows) if r["event_id"] == EVENT_ID]
    if len(idx) != EXPECTED_OLD_ROWS:
        raise AssertionError(f"event {EVENT_ID}: found {len(idx)} rows, expected "
                             f"{EXPECTED_OLD_ROWS} (already rebuilt?)")
    if idx != list(range(idx[0], idx[0] + len(idx))):
        raise AssertionError(f"event {EVENT_ID}: rows are not contiguous")
    new = build(fields)
    rows[idx[0]:idx[-1] + 1] = new

    with open(PB_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    shutil.copyfile(PB_OUT, PB_IN)
    print(f"event {EVENT_ID}: {len(idx)} rows replaced by {len(new)}; "
          f"total {n_in} -> {len(rows)}")


if __name__ == "__main__":
    main()
