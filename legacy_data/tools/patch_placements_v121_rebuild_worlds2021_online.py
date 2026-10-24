#!/usr/bin/env python3
"""
patch_placements_v121_rebuild_worlds2021_online.py

Rebuilds the frozen placements of the 2021 IFPA Online Freestyle World
Championships (event 1623054449) from its curated results file,
event_results/1623054449.txt.

The source page is tab-separated tables with the rank in the last column, which
the parser could not read. The lock was frozen from that misreading: the Open and
Intermediate Shred 30 lists under the bare names "Open" and "Intermediate", one
Women's Sick 3 place under a trick line read as a heading, and four places under
a table header read as a division. The curated file is the authority for the
event: twelve divisions, 89 placements.

Every row of the event is replaced by the file's rows, read from the file when
the patch runs. A competitor is linked to the id the lock already carried for the
same Shred 30 place, otherwise to the id the shared alias resolver returns for
the file's spelling; anyone else is left unresolved. A "(scratch)" note leaves
the place and is not part of the name. Doubles teams are team rows, which the
export resolves member by member.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v121_rebuild_worlds2021_online.py
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
from lock_division_rebuild import PBP, PT, ROOT, Division, Player, Team, rebuild  # noqa: E402
from pipeline.identity.alias_resolver import AliasResolver  # noqa: E402

EVENT_ID = "1623054449"
CURATED = ROOT / "event_results" / f"{EVENT_ID}.txt"
REPLACES = {"4 Fairy Liu Double Orbit > Butterfly > Dlo": 1, "Intermediate": 7, "Open": 15,
            "Rank Player Combo (Judged) Combo": 4}
# The curated Shred 30 lists are the lock's bare-named lists, place for place.
CARRIED_FROM = {"Open Shred 30": "Open", "Intermediate Shred 30": "Intermediate"}
EXPECTED_DIVISIONS = 12
EXPECTED_PLACEMENTS = 89


def main() -> None:
    with open(PT, newline="", encoding="utf-8") as f:
        pt = list(csv.DictReader(f))
    canon = {r["effective_person_id"]: r["person_canon"] for r in pt}
    resolver = AliasResolver(aliases_csv=ROOT / "overrides" / "person_aliases.csv",
                             canonical_persons=[(r["effective_person_id"], r["person_canon"]) for r in pt])
    carried: dict[tuple[str, str], str] = {}
    with open(PBP, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["event_id"] == EVENT_ID and r["person_id"]:
                carried[(r["division_canon"], r["place"])] = r["person_id"]

    def player(div: str, place: int, name: str) -> Player:
        pid = carried.get((CARRIED_FROM.get(div, ""), str(place))) or resolver.resolve(name) or ""
        return Player(place, canon[pid] if pid else name, pid)

    divisions: list[Division] = []
    entries: list = []
    name = None
    for line in CURATED.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        m = re.match(r"^(\d+)\.\s+(.*)$", line)
        if not m:
            if name:
                divisions.append(Division(name, "freestyle", "complete", tuple(entries)))
            name, entries = line.strip(), []
            continue
        place = int(m.group(1))
        text = re.sub(r"\s*\(scratch\)\s*$", "", m.group(2)).strip()
        members = [p.strip() for p in text.split("&")]
        entries.append(Team(place, tuple(members)) if len(members) > 1 else player(name, place, text))
    divisions.append(Division(name, "freestyle", "complete", tuple(entries)))

    placements = sum(len(d.entries) for d in divisions)
    if len(divisions) != EXPECTED_DIVISIONS or placements != EXPECTED_PLACEMENTS:
        raise AssertionError(f"curated file gives {len(divisions)} divisions and {placements} "
                             f"placements, expected {EXPECTED_DIVISIONS} and {EXPECTED_PLACEMENTS}")
    unresolved = sorted({e.name for d in divisions for e in d.entries
                         if isinstance(e, Player) and not e.person_id})
    print(f"left unresolved: {unresolved}")
    rebuild(EVENT_ID, "2021", REPLACES, divisions)


if __name__ == "__main__":
    main()
