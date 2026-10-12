#!/usr/bin/env python3
"""
patch_pt_v73_rename_fournier.py

Correct one canonical person's first name: Brian Fournier -> Bryan Fournier
(person acf08268-cade-5c38-871e-3c3f694d3021).

The Big Add Posse roster, the authority for this name, lists him as
"Bryan Fournier" (nickname Blackjack, inducted 2002), and the curated results
correction for the 1999 Western Regional Championships names him Bryan too.
The identity lock carried "Brian", so every canonical result showed the
misspelling and the honour could not match him by name. "Brian Fournier" and
"Brian Founier" stay searchable aliases, so a lookup on either still resolves.

Three committed files change, and only the rows for this person:
  inputs/identity_lock/Persons_Truth_Final.csv   person_canon, person_canon_clean,
                                                 aliases_presentable
  inputs/identity_lock/Placements_ByPerson.csv   person_canon on his placement rows
  overrides/person_aliases.csv                   person_canon on his alias rows

Each file is rewritten line by line: a row for any other person is copied
through byte for byte, so the diff is exactly this person's rows. A second run
stops on its pre-condition checks rather than compounding the edit; checking
out the three files is the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v73_rename_fournier.py
"""

from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"
PBP = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"
ALIASES = ROOT / "overrides" / "person_aliases.csv"

PID = "acf08268-cade-5c38-871e-3c3f694d3021"
OLD = "Brian Fournier"
NEW = "Bryan Fournier"
PT_ALIASES_PRE = ["Brian Founier", "Bryan Fournier"]
PT_ALIASES_POST = ["Brian Founier", "Brian Fournier"]
EXPECTED_PBP_ROWS = 9
EXPECTED_ALIAS_ROWS = 3


def _emit(row: list[str]) -> str:
    buf = io.StringIO()
    csv.writer(buf, lineterminator="").writerow(row)
    return buf.getvalue()


def _rewrite(path: Path, edit, expected: int) -> None:
    """Apply `edit(header, fields) -> fields | None` to every data line; None
    means the line is not this person's and is copied unchanged."""
    raw = path.read_bytes().decode("utf-8")
    if "\r\n" in raw:
        raise AssertionError(f"{path.name}: expected LF line endings")
    lines = raw.split("\n")
    header = next(csv.reader([lines[0]]))
    changed = 0
    out = [lines[0]]
    for line in lines[1:]:
        if PID not in line:
            out.append(line)
            continue
        fields = next(csv.reader([line]))
        new = edit(header, fields)
        if new is None:
            out.append(line)
            continue
        out.append(_emit(new))
        changed += 1
    if changed != expected:
        raise AssertionError(f"{path.name}: expected {expected} row(s) for {PID}, changed {changed}")
    path.write_text("\n".join(out), encoding="utf-8")
    print(f"{path.relative_to(ROOT)}: {changed} row(s) updated")


def _pt_edit(header, f):
    r = dict(zip(header, f))
    if r["effective_person_id"] != PID:
        return None
    if r["person_canon"] != OLD or r["person_canon_clean"] != OLD:
        raise AssertionError(f"Persons_Truth: expected {OLD!r}, got {r['person_canon']!r}")
    if [a.strip() for a in r["aliases_presentable"].split("|")] != PT_ALIASES_PRE:
        raise AssertionError(f"Persons_Truth: unexpected aliases_presentable {r['aliases_presentable']!r}")
    r["person_canon"] = NEW
    r["person_canon_clean"] = NEW
    r["aliases_presentable"] = " | ".join(PT_ALIASES_POST)
    return [r[h] for h in header]


def _pbp_edit(header, f):
    r = dict(zip(header, f))
    if r["person_id"] != PID:
        return None
    if r["person_canon"] != OLD:
        raise AssertionError(f"Placements: expected {OLD!r}, got {r['person_canon']!r}")
    r["person_canon"] = NEW
    if r.get("norm") == OLD.lower():
        r["norm"] = NEW.lower()
    return [r[h] for h in header]


def _alias_edit(header, f):
    r = dict(zip(header, f))
    if r["person_id"] != PID:
        return None
    if r["person_canon"] != OLD:
        raise AssertionError(f"person_aliases: expected {OLD!r}, got {r['person_canon']!r}")
    r["person_canon"] = NEW
    return [r[h] for h in header]


def main() -> None:
    for p in (PT, PBP, ALIASES):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    _rewrite(PT, _pt_edit, 1)
    _rewrite(PBP, _pbp_edit, EXPECTED_PBP_ROWS)
    _rewrite(ALIASES, _alias_edit, EXPECTED_ALIAS_ROWS)
    print(f"Renamed {PID}: {OLD!r} -> {NEW!r}")


if __name__ == "__main__":
    main()
