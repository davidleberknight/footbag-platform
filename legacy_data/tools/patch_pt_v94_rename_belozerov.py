#!/usr/bin/env python3
"""
patch_pt_v94_rename_belozerov.py

Correct one canonical person's surname: Roman Belozerovin -> Roman Belozerov
(person 37844c75-3ef3-5567-a289-9b6bd07fdfe4, Russia).

Seven captured legacy event pages spell him Belozerov, among them the 2012
Finnish Footbag Open, which lists him twice, as "Roman Belozerov (Russia)" and
"Belozerov, Roman (RUS)". Only the 2006 event page (1161871029) spells him
Belozerovin, and the canonical spelling was adopted from there. That page is a
source record and stays as written; "Roman Belozerovin" becomes a searchable
alias, so it still resolves to him.

Three committed files change, and only the rows for this person:
  inputs/identity_lock/Persons_Truth_Final.csv   person_canon, person_canon_clean,
                                                 aliases_presentable, last_token
  inputs/identity_lock/Placements_ByPerson.csv   person_canon and norm on his own
                                                 placement rows still carrying the
                                                 old spelling (team rows name him
                                                 only inside the team display text,
                                                 which is source text and stays)
  overrides/person_aliases.csv                   his one alias row, which mapped
                                                 the new spelling to the old one;
                                                 it now maps the old spelling to
                                                 the new one

Each file is rewritten line by line: a row for any other person is copied
through byte for byte, so the diff is exactly this person's rows. Every file is
rewritten in memory and checked before any is written. A second run stops on
its pre-condition checks rather than compounding the edit; checking out the
three files is the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v94_rename_belozerov.py
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

PID = "37844c75-3ef3-5567-a289-9b6bd07fdfe4"
OLD = "Roman Belozerovin"
NEW = "Roman Belozerov"
OLD_LAST = "belozerovin"
NEW_LAST = "belozerov"
EXPECTED_PBP_ROWS = 5
EXPECTED_ALIAS_ROWS = 1


def _emit(row: list[str]) -> str:
    buf = io.StringIO()
    csv.writer(buf, lineterminator="").writerow(row)
    return buf.getvalue()


def _rewrite(path: Path, edit, expected: int) -> str:
    """Apply `edit(header, fields) -> fields | None` to every data line of the
    file and return the new text; None means the line is not changed."""
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
    return "\n".join(out)


def _pt_edit(header, f):
    r = dict(zip(header, f))
    if r["effective_person_id"] != PID:
        return None
    if r["person_canon"] != OLD or r["person_canon_clean"] != OLD:
        raise AssertionError(f"Persons_Truth: expected {OLD!r}, got {r['person_canon']!r}")
    if r["aliases_presentable"].strip():
        raise AssertionError(f"Persons_Truth: unexpected aliases_presentable {r['aliases_presentable']!r}")
    if r["last_token"] != OLD_LAST:
        raise AssertionError(f"Persons_Truth: expected last_token {OLD_LAST!r}, got {r['last_token']!r}")
    r["person_canon"] = NEW
    r["person_canon_clean"] = NEW
    r["aliases_presentable"] = OLD
    r["last_token"] = NEW_LAST
    return [r[h] for h in header]


def _pbp_edit(header, f):
    r = dict(zip(header, f))
    if r["person_id"] != PID:
        return None
    if r["person_canon"] == NEW:
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
    if r["alias"] != NEW or r["person_canon"] != OLD:
        raise AssertionError(
            f"person_aliases: expected {NEW!r} -> {OLD!r}, got {r['alias']!r} -> {r['person_canon']!r}")
    r["alias"] = OLD
    r["person_canon"] = NEW
    return [r[h] for h in header]


def main() -> None:
    for p in (PT, PBP, ALIASES):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    pending = [
        (PT, _rewrite(PT, _pt_edit, 1), 1),
        (PBP, _rewrite(PBP, _pbp_edit, EXPECTED_PBP_ROWS), EXPECTED_PBP_ROWS),
        (ALIASES, _rewrite(ALIASES, _alias_edit, EXPECTED_ALIAS_ROWS), EXPECTED_ALIAS_ROWS),
    ]
    for path, text, n in pending:
        path.write_text(text, encoding="utf-8")
        print(f"{path.relative_to(ROOT)}: {n} row(s) updated")
    print(f"Renamed {PID}: {OLD!r} -> {NEW!r}")


if __name__ == "__main__":
    main()
