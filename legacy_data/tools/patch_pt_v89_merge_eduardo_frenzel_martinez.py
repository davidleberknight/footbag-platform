#!/usr/bin/env python3
"""
patch_pt_v89_merge_eduardo_frenzel_martinez.py

Merge the two records of Eduardo Frenzel Martinez, and record a cannot-tell on the
two Rochefort records.

A name match alone is never an identity decision. The maintainer ruled each on
evidence beyond the name:

  Eduardo Frenzel Martinez (5ac74658) and Eduardo Martinez (7b729bc2) are one
    person. The Eduardo Martinez record is linked to account 80298, whose username
    is the Frenzel surname; both records are in Spain; across 21 shared events they
    never appear in the same contest, one entering singles and the other doubles,
    which is one player entering both. The record carrying the account survives,
    under the fuller name Eduardo Frenzel Martinez; Eduardo Martinez stays an alias.
    This replaces the earlier do-not-merge-yet ruling on the pair.

  Jean-Philippe Rochefort and JP Rochefort: cannot tell. The same Montreal winter
    net event in 2001, 2002 and 2004, and JP is the usual short form, but nothing
    beyond that ties the two records to one player.

Operations:
  Persons_Truth_Final.csv       the survivor absorbs the doomed row's player ids and
                                spellings and takes the fuller name, keeping the old
                                one as seen and presentable; the doomed row is deleted
  Placements_ByPerson.csv       the doomed person's own rows move to the survivor;
                                team rows have the doomed id replaced in
                                team_person_key; the survivor's own rows take the
                                fuller name
  Person_Display_Names_v1.csv   a row naming either id follows the survivor
  person_aliases.csv            rows naming either id follow the survivor and its
                                name; the old name gains a row unless one resolves
  identity_review_queue.csv     the earlier ruling on the pair becomes one person;
                                the Rochefort cannot-tell is added

Each file is rewritten line by line: every other line is copied through byte for
byte. Every file is rewritten in memory and checked before any is written. A
second run stops on its pre-condition checks rather than compounding the edit;
checking out the five files is the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v89_merge_eduardo_frenzel_martinez.py
"""

from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.identity.alias_resolver import normalize_name  # noqa: E402

PT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"
PBP = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"
DISPLAY = ROOT / "inputs" / "identity_lock" / "Person_Display_Names_v1.csv"
ALIASES = ROOT / "overrides" / "person_aliases.csv"
REGISTER = ROOT / "overrides" / "identity_review_queue.csv"
DELIM = " | "
NOTE = "another name of the same player; ruled one person on evidence beyond the name"
PENDING: dict[Path, str] = {}

SURVIVOR = "7b729bc2-570a-543c-a460-24ed136deb5b"
SURVIVOR_OLD = "Eduardo Martinez"
NEW_NAME = "Eduardo Frenzel Martinez"
DOOMED = "5ac74658-81ad-5c49-ba70-5834dfb04168"
DOOMED_CANON = "Eduardo Frenzel Martinez"
DOOMED_PLAYER_ROWS, DOOMED_TEAM_ROWS, SURVIVOR_PLAYER_ROWS = 26, 3, 3
SURVIVOR_LEGACYID = "80298.0"

EARLIER_PAIR = "R-02"
EARLIER_NOTE = ("One person: the Eduardo Martinez record is linked to account 80298, whose username is "
                "the Frenzel surname; both records are in Spain; across 21 shared events they never appear "
                "in the same contest, one entering singles and the other doubles. Merged into the record "
                "carrying the account, named Eduardo Frenzel Martinez.")

ROCHEFORT = ("JP Rochefort", "Jean-Philippe Rochefort",
             "aa5c0f07-40ed-539a-b1df-f5c1e6f2a621", "b8fab5e2-d6d3-482b-b062-0f0394d9bd75",
             "Cannot tell: the same Montreal winter net event in 2001, 2002 and 2004, and JP is the usual "
             "short form, but nothing beyond that ties the two records to one player.")


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


def _row(header: list[str], line: str) -> dict[str, str]:
    return dict(zip(header, next(csv.reader([line]))))


def merge_persons_truth() -> None:
    lines = _lines(PT)
    header = next(csv.reader([lines[0]]))
    by_pid = {}
    for line in lines[1:]:
        if line:
            r = _row(header, line)
            by_pid[r["effective_person_id"]] = r
    s, d = by_pid.get(SURVIVOR), by_pid.get(DOOMED)
    if s is None or s["person_canon"] != SURVIVOR_OLD:
        raise AssertionError(f"survivor {SURVIVOR}: expected {SURVIVOR_OLD!r} (already patched?)")
    if s["legacyid"].strip() != SURVIVOR_LEGACYID:
        raise AssertionError(f"survivor {SURVIVOR}: expected the account link {SURVIVOR_LEGACYID}")
    if d is None or d["person_canon"] != DOOMED_CANON:
        raise AssertionError(f"doomed {DOOMED} ({DOOMED_CANON}) missing (already merged?)")
    if d["legacyid"].strip() or d["exclusion_reason"].strip():
        raise AssertionError(f"doomed {DOOMED_CANON} carries an account link or an exclusion")
    ids = set(_pipe(s["player_ids_seen"])) | (set(_pipe(d["player_ids_seen"])) - {DOOMED})
    names = set(_pipe(s["player_names_seen"])) | set(_pipe(d["player_names_seen"])) | {SURVIVOR_OLD, DOOMED_CANON}
    presentable = set(_pipe(s["aliases_presentable"])) | set(_pipe(d["aliases_presentable"])) | {SURVIVOR_OLD}
    presentable.discard(NEW_NAME)
    aliases = set(_pipe(s["aliases"])) | set(_pipe(d["aliases"])) | {SURVIVOR_OLD}
    aliases.discard(NEW_NAME)
    s["player_ids_seen"] = DELIM.join(sorted(ids))
    s["player_names_seen"] = DELIM.join(sorted(names))
    s["aliases_presentable"] = DELIM.join(sorted(presentable))
    s["aliases"] = DELIM.join(sorted(aliases))
    s["person_canon"] = NEW_NAME
    s["person_canon_clean"] = NEW_NAME
    s["last_token"] = NEW_NAME.split()[-1].lower()
    s["norm_key"] = NEW_NAME.lower()
    out, dropped = [lines[0]], 0
    for line in lines[1:]:
        if not line:
            out.append(line)
            continue
        pid = line.split(",", 1)[0]
        if pid == DOOMED:
            dropped += 1
            continue
        if pid == SURVIVOR:
            out.append(_emit([s[h] for h in header]))
            continue
        out.append(line)
    if dropped != 1:
        raise AssertionError(f"persons truth: deleted {dropped} rows, expected 1")
    PENDING[PT] = "\n".join(out)
    print(f"{PT.relative_to(ROOT)}: survivor renamed {NEW_NAME!r}, {dropped} row deleted")


def remap_placements() -> None:
    lines = _lines(PBP)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    player = team = own = 0
    for line in lines[1:]:
        if DOOMED not in line and SURVIVOR not in line:
            out.append(line)
            continue
        r = _row(header, line)
        if r["person_id"] == DOOMED:
            r["person_id"] = SURVIVOR
            player += 1
        elif r["person_id"] == SURVIVOR:
            own += 1
        if r["person_id"] == SURVIVOR:
            r["person_canon"] = NEW_NAME
            r["norm"] = NEW_NAME.lower()
        if DOOMED in r["team_person_key"]:
            r["team_person_key"] = r["team_person_key"].replace(DOOMED, SURVIVOR)
            team += 1
        out.append(_emit([r[h] for h in header]))
    if (player, team, own) != (DOOMED_PLAYER_ROWS, DOOMED_TEAM_ROWS, SURVIVOR_PLAYER_ROWS):
        raise AssertionError(f"placements: moved {player} player and {team} team rows, renamed {own}; "
                             f"expected {DOOMED_PLAYER_ROWS}, {DOOMED_TEAM_ROWS}, {SURVIVOR_PLAYER_ROWS}")
    PENDING[PBP] = "\n".join(out)
    print(f"{PBP.relative_to(ROOT)}: {player} player and {team} team row(s) moved, {own} renamed")


def follow_display_names() -> None:
    lines = _lines(DISPLAY)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    changed = 0
    for line in lines[1:]:
        if DOOMED not in line and SURVIVOR not in line:
            out.append(line)
            continue
        r = _row(header, line)
        if r["effective_person_id"] not in (DOOMED, SURVIVOR):
            raise AssertionError(f"display names: id in an unexpected column: {line[:120]}")
        r["effective_person_id"] = SURVIVOR
        r["person_canon"] = NEW_NAME
        out.append(_emit([r[h] for h in header]))
        changed += 1
    PENDING[DISPLAY] = "\n".join(out)
    print(f"{DISPLAY.relative_to(ROOT)}: {changed} row(s) followed")


def follow_and_add_aliases() -> None:
    lines = _lines(ALIASES)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    resolves: dict[str, str] = {}
    followed = 0
    for line in lines[1:]:
        if not line:
            continue
        r = _row(header, line)
        if r["person_id"] in (DOOMED, SURVIVOR):
            r["person_id"], r["person_canon"] = SURVIVOR, NEW_NAME
            line = _emit([r[h] for h in header])
            followed += 1
        resolves.setdefault(normalize_name(r["alias"]), r["person_id"])
        out.append(line)
    added = 0
    for spelling in (SURVIVOR_OLD, DOOMED_CANON):
        key = normalize_name(spelling)
        if key == normalize_name(NEW_NAME):
            continue
        owner = resolves.get(key)
        if owner == SURVIVOR:
            continue
        if owner is not None:
            raise AssertionError(f"alias {spelling!r} already resolves to {owner}, not {SURVIVOR}")
        out.append(_emit([spelling, SURVIVOR, NEW_NAME, "verified", NOTE]))
        resolves[key] = SURVIVOR
        added += 1
    out.append("")
    PENDING[ALIASES] = "\n".join(out)
    print(f"{ALIASES.relative_to(ROOT)}: {followed} alias row(s) followed, {added} added")


def update_register() -> None:
    lines = _lines(REGISTER)
    header = next(csv.reader([lines[0]]))
    body = [line for line in lines if line]
    for i, line in enumerate(body[1:], start=1):
        r = _row(header, line)
        if r["pair_id"] == EARLIER_PAIR:
            if r["status"] != "DO_NOT_MERGE_YET" or r["alias_pid"] != DOOMED or r["canon_pid"] != SURVIVOR:
                raise AssertionError(f"{EARLIER_PAIR}: not the earlier Martinez ruling (already patched?)")
            r["status"] = "SAME"
            r["evidence_needed"] = "none"
            r["notes"] = EARLIER_NOTE
            body[i] = _emit([r[h] for h in header])
            break
    else:
        raise AssertionError(f"{EARLIER_PAIR} missing from the register")
    other, name, alias_pid, canon_pid, reason = ROCHEFORT
    existing = {frozenset((normalize_name(_row(header, line)["alias_name"]),
                           normalize_name(_row(header, line)["canon_name"]))) for line in body[1:]}
    if frozenset((normalize_name(other), normalize_name(name))) in existing:
        raise AssertionError(f"register already rules {other!r} and {name!r} (already patched?)")
    next_number = max(int(_row(header, line)["pair_id"].split("-")[1]) for line in body[1:]) + 1
    row = {h: "" for h in header}
    row.update({
        "pair_id": f"R-{next_number}",
        "alias_name": other,
        "canon_name": name,
        "alias_pid": alias_pid,
        "canon_pid": canon_pid,
        "evidence_needed": "an outside source tying the two records to one player",
        "status": "CANNOT_TELL",
        "notes": reason,
    })
    body.append(_emit([row[h] for h in header]))
    PENDING[REGISTER] = "\n".join(body) + "\n"
    print(f"{REGISTER.relative_to(ROOT)}: {EARLIER_PAIR} updated, R-{next_number} added")


def postconditions() -> None:
    for path, text in PENDING.items():
        if path != REGISTER and DOOMED in text:
            raise AssertionError(f"{path.name} would still name doomed id {DOOMED}")


def main() -> None:
    for p in (PT, PBP, DISPLAY, ALIASES, REGISTER):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    merge_persons_truth()
    remap_placements()
    follow_display_names()
    follow_and_add_aliases()
    update_register()
    postconditions()
    for path, text in PENDING.items():
        path.write_text(text, encoding="utf-8")
    print("Merged Eduardo Frenzel Martinez, recorded the Rochefort cannot-tell")


if __name__ == "__main__":
    main()
