#!/usr/bin/env python3
"""
patch_placements_v112_unify_split_division_names.py

Gives each split division in the frozen placements lock one name, the one the
current stage-2 parse gives it.

The lock holds two generations of division names. Most rows of a division carry
the older spelling, with a dash read as "?", a trailing colon or a dropped space;
rows added later for the same division carry the current spelling. The export
builds one discipline per spelling, so each of these divisions reached the site
twice: once with most of its places and once with the rest. Six of them showed
as a duplicate section; on 30 Second Shred - Intermediate (Texas State 2001) and
Intermediate Singles Net (US Open 2008) the second copy held only an unnamed
place and showed as an empty one.

The 2005 Championnat de France is the same split under a rename rather than a
spelling: seven places of Shred 30 carry "Shred 30 Sec" and place 6 carries the
current name. Its curated results file names the division "Shred 30".

Every row of the older spelling takes the current name, and keeps the older text
in division_raw when that is empty. A division whose two spellings hold the same
place for the same competitor type is not renamed: that would be two sources for
one place, and the patch stops.

The file is rewritten line by line: every other line is copied through byte for
byte. A second run stops on its pre-condition checks; checking out the file is
the rollback.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_placements_v112_unify_split_division_names.py
"""

from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PBP = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"

# (event_id, older spelling, current name, rows carrying the older spelling)
RENAMES = [
    ("1001942070", "30 Second Shred ? Intermediate", "30 Second Shred - Intermediate", 2),
    ("1046985067", "Intermediate Big3", "Intermediate Big 3", 2),
    ("1058378281", "Freestyle ? 30 Second Shred", "Freestyle - 30 Second Shred", 7),
    ("1058378281", "Freestyle ? Open", "Freestyle - Open", 10),
    ("1080757998", "Open Sick3", "Open Sick 3", 2),
    ("1103297805", "Shred 30 Sec", "Shred 30", 7),
    ("1193783964", "Intermediate Doubles Net:", "Intermediate Doubles Net", 5),
    ("1193783964", "Intermediate Singles Net:", "Intermediate Singles Net", 12),
]


def _emit(row: list[str]) -> str:
    buf = io.StringIO()
    csv.writer(buf, lineterminator="").writerow(row)
    return buf.getvalue()


def main() -> None:
    if not PBP.exists():
        print(f"ERROR: {PBP} not found", file=sys.stderr)
        sys.exit(1)
    raw = PBP.read_bytes().decode("utf-8")
    if "\r\n" in raw:
        raise AssertionError(f"{PBP.name}: expected LF line endings")
    lines = raw.split("\n")
    header = next(csv.reader([lines[0]]))
    rows = [(i, dict(zip(header, next(csv.reader([ln]))))) for i, ln in enumerate(lines[1:], 1) if ln]

    by_key = {(ev, old): (new, n) for ev, old, new, n in RENAMES}
    found = {k: 0 for k in by_key}
    for ev, old, new, _ in RENAMES:
        current = {(r["place"], r["competitor_type"]) for _, r in rows
                   if r["event_id"] == ev and r["division_canon"] == new}
        if not current:
            raise AssertionError(f"{ev}: no row carries the current name {new!r}")
        older = {(r["place"], r["competitor_type"]) for _, r in rows
                 if r["event_id"] == ev and r["division_canon"] == old}
        clash = sorted(current & older)
        if clash:
            raise AssertionError(f"{ev}: {old!r} and {new!r} both hold {clash}; two sources for one place")

    for i, r in rows:
        key = (r["event_id"], r["division_canon"])
        if key not in by_key:
            continue
        new, _ = by_key[key]
        found[key] += 1
        if not r["division_raw"].strip():
            r["division_raw"] = r["division_canon"]
        r["division_canon"] = new
        lines[i] = _emit([r[h] for h in header])

    for key, (_, expected) in by_key.items():
        if found[key] != expected:
            raise AssertionError(f"{key}: renamed {found[key]} rows, expected {expected} (already applied?)")

    PBP.write_text("\n".join(lines), encoding="utf-8")
    print(f"{PBP.relative_to(ROOT)}: {sum(found.values())} rows across {len(RENAMES)} divisions renamed")


if __name__ == "__main__":
    main()
