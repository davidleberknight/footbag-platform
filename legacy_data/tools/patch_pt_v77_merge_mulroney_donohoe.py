#!/usr/bin/env python3
"""
patch_pt_v77_merge_mulroney_donohoe.py

Merge `Ryan Mulroney` (4cf390be) into `Ryan Donohoe` (ebbab34d): one person who
changed his surname. He is recorded under his current surname, Donohoe, and
"Ryan Mulroney" stays as the name his historical results were published under.

Evidence. His Footbag Hall of Fame page opens "Ryan Mulroney (now Ryan Donohoe)
began playing footbag in Placentia, California, in 1996." On the legacy site's
World Championships pages for 2000, 2001 and 2002, the structured results
(rendered from the linked account, 13152, "Ryan Donohoe") and the original
results text on the same page name the same placements as Ryan Donohoe and Ryan
Mulroney respectively. Account 13152 was created in January 2000 and its bio
points to www.ryanmulroney.com. The Hall of Fame director confirmed the merge.

Before the merge the lock split him: the Mulroney row carried his competitive
record (36 placements, three team placements) and, through the alias file, his
Big Add Posse 1997 honour; the Donohoe row carried two placements and the Hall
of Fame 2017 honour. No placement appears under both, so nothing duplicates.

Operations:
  Persons_Truth_Final.csv   survivor absorbs the doomed row's player ids and gains
                            'Ryan Mulroney' in player_names_seen and
                            aliases_presentable; the doomed row is deleted
  Placements_ByPerson.csv   the doomed person's own placement rows move to the
                            survivor (person_id, person_canon, norm); team rows
                            have the doomed id replaced in team_person_key, and
                            their team display text, which is source text, stays
  person_aliases.csv        the doomed person's alias rows point at the survivor,
                            so the Big Add Posse roster's "Ryan Mulroney" now
                            resolves to him

Each file is rewritten line by line: every other line is copied through byte for
byte. A second run stops on its pre-condition checks rather than compounding the
edit; checking out the three files is the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v77_merge_mulroney_donohoe.py
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

SURVIVOR_PID = "ebbab34d-36f8-541b-9151-362cbe66b96e"  # Ryan Donohoe
DOOMED_PID = "4cf390be-81e9-586c-95c7-aa90dd752ba8"    # Ryan Mulroney
SURVIVOR_CANON = "Ryan Donohoe"
DOOMED_CANON = "Ryan Mulroney"
EXPECTED_PLAYER_ROWS = 36
EXPECTED_TEAM_ROWS = 3
EXPECTED_ALIAS_ROWS = 3
DELIM = " | "
PENDING: dict[Path, str] = {}


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


def merge_persons_truth() -> None:
    lines = _lines(PT)
    header = next(csv.reader([lines[0]]))
    rows = {}
    for line in lines[1:]:
        if SURVIVOR_PID in line or DOOMED_PID in line:
            r = dict(zip(header, next(csv.reader([line]))))
            rows[r["effective_person_id"]] = r
    if set(rows) != {SURVIVOR_PID, DOOMED_PID}:
        raise AssertionError(f"expected both rows, found {sorted(rows)} (already merged?)")
    s, d = rows[SURVIVOR_PID], rows[DOOMED_PID]
    if s["person_canon"] != SURVIVOR_CANON or d["person_canon"] != DOOMED_CANON:
        raise AssertionError(f"unexpected names {s['person_canon']!r} / {d['person_canon']!r}")
    if d["legacyid"].strip():
        raise AssertionError("doomed row carries a legacy account link")
    s["player_ids_seen"] = DELIM.join(sorted(set(_pipe(s["player_ids_seen"])) | set(_pipe(d["player_ids_seen"]))))
    for field in ("player_names_seen", "aliases_presentable"):
        s[field] = DELIM.join(sorted(set(_pipe(s[field])) | {DOOMED_CANON}))
    out = [lines[0]]
    for line in lines[1:]:
        if DOOMED_PID in line:
            continue
        if SURVIVOR_PID in line:
            out.append(_emit([s[h] for h in header]))
            continue
        out.append(line)
    PENDING[PT] = "\n".join(out)
    print(f"{PT.relative_to(ROOT)}: survivor updated, {DOOMED_CANON} row deleted")


def remap_placements() -> None:
    lines = _lines(PBP)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    players = teams = 0
    for line in lines[1:]:
        if DOOMED_PID not in line:
            out.append(line)
            continue
        r = dict(zip(header, next(csv.reader([line]))))
        if r["person_id"] == DOOMED_PID:
            r["person_id"] = SURVIVOR_PID
            r["person_canon"] = SURVIVOR_CANON
            if r.get("norm") == DOOMED_CANON.lower():
                r["norm"] = SURVIVOR_CANON.lower()
            players += 1
        elif DOOMED_PID in r["team_person_key"]:
            r["team_person_key"] = r["team_person_key"].replace(DOOMED_PID, SURVIVOR_PID)
            teams += 1
        else:
            raise AssertionError(f"doomed id in an unexpected column: {line[:120]}")
        out.append(_emit([r[h] for h in header]))
    if (players, teams) != (EXPECTED_PLAYER_ROWS, EXPECTED_TEAM_ROWS):
        raise AssertionError(f"placements: moved {players} player and {teams} team rows; expected "
                             f"{EXPECTED_PLAYER_ROWS} and {EXPECTED_TEAM_ROWS}")
    PENDING[PBP] = "\n".join(out)
    print(f"{PBP.relative_to(ROOT)}: {players} player and {teams} team row(s) moved")


def repoint_aliases() -> None:
    lines = _lines(ALIASES)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    changed = 0
    for line in lines[1:]:
        if DOOMED_PID not in line:
            out.append(line)
            continue
        r = dict(zip(header, next(csv.reader([line]))))
        if r["person_id"] != DOOMED_PID:
            out.append(line)
            continue
        r["person_id"] = SURVIVOR_PID
        r["person_canon"] = SURVIVOR_CANON
        out.append(_emit([r[h] for h in header]))
        changed += 1
    if changed != EXPECTED_ALIAS_ROWS:
        raise AssertionError(f"aliases: repointed {changed}, expected {EXPECTED_ALIAS_ROWS}")
    PENDING[ALIASES] = "\n".join(out)
    print(f"{ALIASES.relative_to(ROOT)}: {changed} alias row(s) now point at {SURVIVOR_CANON}")


def postconditions() -> None:
    for path, text in PENDING.items():
        if DOOMED_PID in text:
            raise AssertionError(f"{path.name} would still name the doomed id")


def main() -> None:
    for p in (PT, PBP, ALIASES):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    # Every file is rewritten in memory and checked before any is written, so a
    # failed check leaves all three untouched rather than half merged.
    merge_persons_truth()
    remap_placements()
    repoint_aliases()
    postconditions()
    for path, text in PENDING.items():
        path.write_text(text, encoding="utf-8")
    print(f"Merged {DOOMED_CANON} into {SURVIVOR_CANON}")


if __name__ == "__main__":
    main()
