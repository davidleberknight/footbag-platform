#!/usr/bin/env python3
"""
patch_pt_v76_rename_wigger.py

Correct one canonical person's first name: Torbin Wigger -> Torben Wigger
(person f38e2f8e-cba6-5fff-8b20-90791fd0d794, Hall of Fame 1999, Denmark).

Every authoritative source spells him Torben: the Footbag Hall of Fame site,
the legacy site's 1999 Hall of Fame pages, his own old footbag.org account
("Torben Wigger Hansen"), the curated Hall of Fame roster and the 1980-1985
authoritative results transcription. "Torbin" came from a single curated
transcription of the 1986 Worlds results and was adopted as the canonical
spelling from there. That transcription is a source record and stays as
written; "Torbin Wigger" stays a searchable alias, so it still resolves to him.

Four committed files change, and only the rows for this person:
  inputs/identity_lock/Persons_Truth_Final.csv   person_canon, person_canon_clean,
                                                 aliases_presentable
  inputs/identity_lock/Placements_ByPerson.csv   person_canon and norm on his own
                                                 placement rows (team rows name him
                                                 only inside the team display text,
                                                 which is source text and stays)
  overrides/person_aliases.csv                   person_canon on his alias rows
  inputs/person_country_overrides.csv            person_name on his one row

Each file is rewritten line by line: a row for any other person is copied
through byte for byte, so the diff is exactly this person's rows. A second run
stops on its pre-condition checks rather than compounding the edit; checking
out the four files is the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v76_rename_wigger.py
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
COUNTRY = ROOT / "inputs" / "person_country_overrides.csv"

PID = "f38e2f8e-cba6-5fff-8b20-90791fd0d794"
OLD = "Torbin Wigger"
NEW = "Torben Wigger"
PT_ALIASES_PRE = ["Torben Wigger"]
PT_ALIASES_POST = ["Torbin Wigger"]
EXPECTED_PBP_ROWS = 5
EXPECTED_ALIAS_ROWS = 5
EXPECTED_COUNTRY_ROWS = 1


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
    if [a.strip() for a in r["aliases_presentable"].split("|") if a.strip()] != PT_ALIASES_PRE:
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


def _country_edit(header, f):
    r = dict(zip(header, f))
    if r["person_id"] != PID:
        return None
    if r["person_name"] != OLD:
        raise AssertionError(f"person_country_overrides: expected {OLD!r}, got {r['person_name']!r}")
    r["person_name"] = NEW
    return [r[h] for h in header]


def main() -> None:
    for p in (PT, PBP, ALIASES, COUNTRY):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    _rewrite(PT, _pt_edit, 1)
    _rewrite(PBP, _pbp_edit, EXPECTED_PBP_ROWS)
    _rewrite(ALIASES, _alias_edit, EXPECTED_ALIAS_ROWS)
    _rewrite(COUNTRY, _country_edit, EXPECTED_COUNTRY_ROWS)
    print(f"Renamed {PID}: {OLD!r} -> {NEW!r}")


if __name__ == "__main__":
    main()
