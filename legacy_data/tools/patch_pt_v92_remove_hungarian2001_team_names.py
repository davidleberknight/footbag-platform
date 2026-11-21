#!/usr/bin/env python3
"""
patch_pt_v92_remove_hungarian2001_team_names.py

Removes four doubles teams of the 1st Hungarian Footbag Cup 2001 (event 979816633)
from the persons registry, where each stood as one person.

The page lists its doubles by surname pairs joined by a plus sign:

    doubles:
    1.) Kiss + Gyáni
    2.) Homola + Halász
    3.) Jazz + Juz
    4.) Szolosi + Horváth

Each pair was minted as a person when every unresolved result name was given a
record. A team is never a person. The results are not lost: the four lock rows
carry the pair text with no person id, and the team-correction list splits each
pair into its two players, so no row in any identity file names these records.

Persons_Truth_Final.csv is rewritten line by line: the four rows are deleted and
every other line is copied through byte for byte. The patch checks, before
writing, that each record carries the pair as its name, no account link and no
player id other than its own, and that no placement, display-name or alias row
names it. A second run stops on its pre-condition checks; checking out the file is
the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v92_remove_hungarian2001_team_names.py
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"
PBP = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"
DISPLAY = ROOT / "inputs" / "identity_lock" / "Person_Display_Names_v1.csv"
ALIASES = ROOT / "overrides" / "person_aliases.csv"

DOOMED = {
    "ab878df2-aa71-5c38-a549-e3b29c6455f4": "Kiss + Gyáni",
    "004b1911-36bc-5804-af96-14c5e5cde585": "Homola + Halász",
    "dbc24aa3-50da-5e23-8d1d-e8f3fd379260": "Jazz + Juz",
    "1f9901eb-d992-5944-acce-f6f5e20fb580": "Szolosi + Horváth",
}


def _lines(path: Path) -> list[str]:
    raw = path.read_bytes().decode("utf-8")
    if "\r\n" in raw:
        raise AssertionError(f"{path.name}: expected LF line endings")
    return raw.split("\n")


def main() -> None:
    for p in (PT, PBP, DISPLAY, ALIASES):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    for p in (PBP, DISPLAY, ALIASES):
        text = p.read_text(encoding="utf-8")
        named = [pid for pid in DOOMED if pid in text]
        if named:
            raise AssertionError(f"{p.name} names {named}; these records are not free to delete")

    lines = _lines(PT)
    header = next(csv.reader([lines[0]]))
    out, dropped = [lines[0]], []
    for line in lines[1:]:
        pid = line.split(",", 1)[0] if line else ""
        if pid not in DOOMED:
            out.append(line)
            continue
        r = dict(zip(header, next(csv.reader([line]))))
        if r["person_canon"] != DOOMED[pid]:
            raise AssertionError(f"{pid}: expected {DOOMED[pid]!r}, got {r['person_canon']!r}")
        if r["legacyid"].strip():
            raise AssertionError(f"{DOOMED[pid]} carries a legacy account link")
        if set(p.strip() for p in r["player_ids_seen"].split("|") if p.strip()) - {pid}:
            raise AssertionError(f"{DOOMED[pid]} carries player ids beyond its own")
        dropped.append(DOOMED[pid])
    if len(dropped) != len(DOOMED):
        missing = sorted(set(DOOMED.values()) - set(dropped))
        raise AssertionError(f"persons truth: {missing} not found (already removed?)")

    PT.write_text("\n".join(out), encoding="utf-8")
    print(f"{PT.relative_to(ROOT)}: {len(dropped)} team-name rows deleted: {', '.join(dropped)}")


if __name__ == "__main__":
    main()
