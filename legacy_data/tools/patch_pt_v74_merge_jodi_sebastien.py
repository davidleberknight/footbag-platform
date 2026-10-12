#!/usr/bin/env python3
"""
patch_pt_v74_merge_jodi_sebastien.py

Merge `Jodi Sebastien` (2064a9fe) into `Jodi Sebastian` (2224d6ba).

One person. "Jodi Sebastien" is a misspelling: the alias registry already maps
it to Jodi Sebastian as a verified typo, and the misspelt row has no player id,
no placement and no legacy account. It was minted as an unresolved participant
and never joined to the real record. Jodi Sebastian is not Jody Welch (also
recorded as Jody Badger Welch), who is a different person; nothing here touches
that record.

Operations:
  Persons_Truth_Final.csv        survivor gains 'Jodi Sebastien' in
                                 player_names_seen and aliases_presentable;
                                 the misspelt row is deleted
  person_country_overrides.csv   the misspelt row's one line is deleted

Each file is rewritten line by line: every other line is copied through byte
for byte, so the diff is exactly these rows. Placements_ByPerson.csv and the
alias registry are read only, to prove the misspelt record owns nothing and the
alias already points at the survivor. A second run stops on its pre-condition
checks rather than compounding the edit; checking out the two files is the
rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v74_merge_jodi_sebastien.py
"""

from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"
PBP = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"
COUNTRY = ROOT / "inputs" / "person_country_overrides.csv"
ALIASES = ROOT / "overrides" / "person_aliases.csv"

SURVIVOR_PID = "2224d6ba-5be4-56a5-90e1-aaa61a15bcb0"  # Jodi Sebastian
DOOMED_PID = "2064a9fe-7880-5cf7-80a4-933eb33d6db0"    # Jodi Sebastien
SURVIVOR_CANON = "Jodi Sebastian"
DOOMED_CANON = "Jodi Sebastien"
DELIM = " | "


def _emit(row: list[str]) -> str:
    buf = io.StringIO()
    csv.writer(buf, lineterminator="").writerow(row)
    return buf.getvalue()


def _pipe(value: str) -> list[str]:
    return [p.strip() for p in (value or "").split("|") if p.strip()]


def _lines(path: Path) -> list[str]:
    raw = path.read_bytes().decode("utf-8")
    if "\r\n" in raw:
        raise AssertionError(f"{path.name}: expected LF line endings")
    return raw.split("\n")


def _rows_for(path: Path, column: str, value: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as fh:
        return [r for r in csv.DictReader(fh) if r[column] == value]


def preconditions() -> None:
    survivor = _rows_for(PT, "effective_person_id", SURVIVOR_PID)
    doomed = _rows_for(PT, "effective_person_id", DOOMED_PID)
    if len(survivor) != 1 or len(doomed) != 1:
        raise AssertionError(f"expected one row each, found survivor={len(survivor)} "
                             f"doomed={len(doomed)} (already merged?)")
    s, d = survivor[0], doomed[0]
    if s["person_canon"] != SURVIVOR_CANON:
        raise AssertionError(f"survivor canon is {s['person_canon']!r}")
    if d["person_canon"] != DOOMED_CANON:
        raise AssertionError(f"doomed canon is {d['person_canon']!r}")
    if _pipe(d["player_ids_seen"]) or d["legacyid"].strip():
        raise AssertionError("doomed row carries a player id or a legacy account")
    if _rows_for(PBP, "person_id", DOOMED_PID):
        raise AssertionError("doomed row owns placements; remap them first")
    alias = [r for r in _rows_for(ALIASES, "alias", DOOMED_CANON)]
    if [(r["person_id"], r["status"]) for r in alias] != [(SURVIVOR_PID, "verified")]:
        raise AssertionError(f"alias registry does not map {DOOMED_CANON!r} to the "
                             f"survivor as verified: {alias}")
    if len(_rows_for(COUNTRY, "person_id", DOOMED_PID)) != 1:
        raise AssertionError("expected one country override row for the doomed record")


def merge_persons_truth() -> None:
    lines = _lines(PT)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    deleted = updated = 0
    for line in lines[1:]:
        if DOOMED_PID in line:
            deleted += 1
            continue
        if SURVIVOR_PID in line:
            r = dict(zip(header, next(csv.reader([line]))))
            if r["effective_person_id"] == SURVIVOR_PID:
                for field in ("player_names_seen", "aliases_presentable"):
                    r[field] = DELIM.join(sorted(set(_pipe(r[field])) | {DOOMED_CANON}))
                out.append(_emit([r[h] for h in header]))
                updated += 1
                continue
        out.append(line)
    if (deleted, updated) != (1, 1):
        raise AssertionError(f"Persons_Truth: deleted {deleted}, updated {updated}; expected 1 and 1")
    PT.write_text("\n".join(out), encoding="utf-8")
    print(f"{PT.relative_to(ROOT)}: survivor updated, misspelt row deleted")


def drop_country_override() -> None:
    lines = _lines(COUNTRY)
    out = [line for line in lines if not line.startswith(DOOMED_PID + ",")]
    if len(lines) - len(out) != 1:
        raise AssertionError(f"{COUNTRY.name}: expected to remove 1 line, removed {len(lines) - len(out)}")
    COUNTRY.write_text("\n".join(out), encoding="utf-8")
    print(f"{COUNTRY.relative_to(ROOT)}: misspelt row's line deleted")


def postconditions() -> None:
    if _rows_for(PT, "effective_person_id", DOOMED_PID):
        raise AssertionError("doomed row still present")
    s = _rows_for(PT, "effective_person_id", SURVIVOR_PID)[0]
    for field in ("player_names_seen", "aliases_presentable"):
        if DOOMED_CANON not in _pipe(s[field]):
            raise AssertionError(f"survivor {field} lacks {DOOMED_CANON!r}")
    if _rows_for(COUNTRY, "person_id", DOOMED_PID):
        raise AssertionError("country override for the doomed record still present")


def main() -> None:
    for p in (PT, PBP, COUNTRY, ALIASES):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    preconditions()
    print("All pre-condition checks passed.")
    merge_persons_truth()
    drop_country_override()
    postconditions()
    print(f"Merged {DOOMED_PID[:8]} {DOOMED_CANON!r} into {SURVIVOR_PID[:8]} {SURVIVOR_CANON!r}")


if __name__ == "__main__":
    main()
