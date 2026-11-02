#!/usr/bin/env python3
"""
patch_pt_v86_merge_nold_and_yao.py

Merge four duplicate person rows into two players' records.

A name match alone is never an identity decision. The maintainer ruled each on
evidence beyond the name:

  Stefan Stuff Nold (62f27d60), Stefan "Stuff Nold (45c7be8f) and Stuff Nold
  (42ac71dd) -> Stefan Nold (e2ad332e). Stuff is his nickname: account 67496, which
    the member load links to Stefan Nold, carries it, and the verified alias "Stuff
    Himself" already resolves to him. The two records with results share a doubles
    partner in 2012. The other two rows own no placements.

  Gary Yao (862e03c6) -> Zhong Jia Yao (4420f12f). Account 83723 is "Zhong Gary Jia
    Yao". It is registered at the 2021 world championships, in doubles with Bruce
    Li, and the results of that event list Bruce Li and Gary Yao.

The survivor's name stays as it is. Their placements move to the survivor; a doubles
team's display text, which is source text, stays.

Operations:
  Persons_Truth_Final.csv       survivor absorbs the doomed rows' player ids, and
                                gains their spellings in player_names_seen and
                                aliases_presentable; the doomed rows are deleted
  Placements_ByPerson.csv       the doomed person's own rows move to the survivor;
                                team rows have the doomed id replaced in
                                team_person_key
  person_aliases.csv            alias rows naming a doomed id point at the
                                survivor; every doomed spelling gains an alias row
                                unless one already resolves to the survivor

Each file is rewritten line by line: every other line is copied through byte for
byte. Every file is rewritten in memory and checked before any is written. A
second run stops on its pre-condition checks rather than compounding the edit;
checking out the three files is the rollback.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_pt_v86_merge_nold_and_yao.py
"""

from __future__ import annotations

import csv
import io
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.identity.alias_resolver import normalize_name  # noqa: E402

PT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"
PBP = ROOT / "inputs" / "identity_lock" / "Placements_ByPerson.csv"
ALIASES = ROOT / "overrides" / "person_aliases.csv"
DELIM = " | "
NOTE = "another name of the same player; ruled one person on evidence beyond the name"
PENDING: dict[Path, str] = {}


@dataclass
class Merge:
    survivor_pid: str
    canon: str
    doomed_pid: str
    doomed_canon: str


NOLD = "e2ad332e-4635-5c13-9bc3-9cd157eaee8d"
YAO = "4420f12f-009b-574a-8d87-52aa7a7d76e3"
MERGES: list[Merge] = [
    Merge(NOLD, "Stefan Nold", "62f27d60-f401-51d8-8da4-5903c7766893", "Stefan Stuff Nold"),
    Merge(NOLD, "Stefan Nold", "45c7be8f-bd67-533a-b63a-980978c3bb65", 'Stefan "Stuff Nold'),
    Merge(NOLD, "Stefan Nold", "42ac71dd-3b87-523a-82af-09196aad8042", "Stuff Nold"),
    Merge(YAO, "Zhong Jia Yao", "862e03c6-8d7a-5d53-9571-016904a7b7b2", "Gary Yao"),
]
EXPECTED_DOOMED = 4

# Doomed rows that own placements in the lock: (player rows, team rows).
OWNS_PLACEMENTS = {
    "62f27d60-f401-51d8-8da4-5903c7766893": (1, 3),
    "862e03c6-8d7a-5d53-9571-016904a7b7b2": (4, 0),
}

DOOMED_TO = {m.doomed_pid: m for m in MERGES}


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
    for m in MERGES:
        s = by_pid.get(m.survivor_pid)
        if s is None:
            raise AssertionError(f"survivor {m.survivor_pid} ({m.canon}) missing")
        if s["person_canon"] != m.canon:
            raise AssertionError(f"survivor {m.survivor_pid}: expected {m.canon!r}, got {s['person_canon']!r}")
        d = by_pid.get(m.doomed_pid)
        if d is None:
            raise AssertionError(f"doomed {m.doomed_pid} ({m.doomed_canon}) missing (already merged?)")
        if d["person_canon"] != m.doomed_canon:
            raise AssertionError(f"doomed {m.doomed_pid}: expected {m.doomed_canon!r}, got {d['person_canon']!r}")
        if d["legacyid"].strip():
            raise AssertionError(f"doomed {m.doomed_canon} carries a legacy account link")
        if d["exclusion_reason"].strip():
            raise AssertionError(f"doomed {m.doomed_canon} carries an exclusion")
        ids = set(_pipe(s["player_ids_seen"])) | (set(_pipe(d["player_ids_seen"])) - {m.doomed_pid})
        names = set(_pipe(s["player_names_seen"])) | {m.doomed_canon}
        presentable = set(_pipe(s["aliases_presentable"])) | {m.doomed_canon}
        presentable.discard(m.canon)
        s["player_ids_seen"] = DELIM.join(sorted(ids))
        s["player_names_seen"] = DELIM.join(sorted(names))
        s["aliases_presentable"] = DELIM.join(sorted(presentable))
    survivors = {m.survivor_pid for m in MERGES}
    out, dropped = [lines[0]], 0
    for line in lines[1:]:
        if not line:
            out.append(line)
            continue
        pid = line.split(",", 1)[0]
        if pid in DOOMED_TO:
            dropped += 1
            continue
        if pid in survivors:
            out.append(_emit([by_pid[pid][h] for h in header]))
            continue
        out.append(line)
    if dropped != EXPECTED_DOOMED:
        raise AssertionError(f"persons truth: deleted {dropped} rows, expected {EXPECTED_DOOMED}")
    PENDING[PT] = "\n".join(out)
    print(f"{PT.relative_to(ROOT)}: {len(survivors)} survivors updated, {dropped} rows deleted")


def remap_placements() -> None:
    lines = _lines(PBP)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    moved: dict[str, list[int]] = {pid: [0, 0] for pid in OWNS_PLACEMENTS}
    for line in lines[1:]:
        hit = [pid for pid in DOOMED_TO if pid in line]
        if not hit:
            out.append(line)
            continue
        r = _row(header, line)
        for pid in hit:
            if pid not in OWNS_PLACEMENTS:
                raise AssertionError(f"placements: {DOOMED_TO[pid].doomed_canon} doomed id {pid} unexpectedly present")
            m = DOOMED_TO[pid]
            if r["person_id"] == pid:
                r["person_id"] = m.survivor_pid
                r["person_canon"] = m.canon
                r["norm"] = m.canon.lower()
                moved[pid][0] += 1
            elif pid in r["team_person_key"]:
                r["team_person_key"] = r["team_person_key"].replace(pid, m.survivor_pid)
                moved[pid][1] += 1
            else:
                raise AssertionError(f"doomed id in an unexpected column: {line[:120]}")
        out.append(_emit([r[h] for h in header]))
    for pid, expected in OWNS_PLACEMENTS.items():
        if tuple(moved[pid]) != expected:
            raise AssertionError(f"placements for {pid}: moved {moved[pid]}, expected {expected}")
    PENDING[PBP] = "\n".join(out)
    total = [sum(v[i] for v in moved.values()) for i in (0, 1)]
    print(f"{PBP.relative_to(ROOT)}: {total[0]} player and {total[1]} team row(s) moved")


def repoint_and_add_aliases() -> None:
    lines = _lines(ALIASES)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    resolves: dict[str, str] = {}
    repointed = 0
    for line in lines[1:]:
        if not line:
            continue
        r = _row(header, line)
        if r["person_id"] in DOOMED_TO:
            m = DOOMED_TO[r["person_id"]]
            r["person_id"], r["person_canon"] = m.survivor_pid, m.canon
            line = _emit([r[h] for h in header])
            repointed += 1
        resolves.setdefault(normalize_name(r["alias"]), r["person_id"])
        out.append(line)
    added = 0
    for m in MERGES:
        key = normalize_name(m.doomed_canon)
        if key == normalize_name(m.canon):
            continue
        owner = resolves.get(key)
        if owner == m.survivor_pid:
            continue
        if owner is not None:
            raise AssertionError(f"alias {m.doomed_canon!r} already resolves to {owner}, not {m.survivor_pid}")
        out.append(_emit([m.doomed_canon, m.survivor_pid, m.canon, "verified", NOTE]))
        resolves[key] = m.survivor_pid
        added += 1
    out.append("")
    PENDING[ALIASES] = "\n".join(out)
    print(f"{ALIASES.relative_to(ROOT)}: {repointed} alias row(s) repointed, {added} added")


def postconditions() -> None:
    for path, text in PENDING.items():
        for pid in DOOMED_TO:
            if pid in text:
                raise AssertionError(f"{path.name} would still name doomed id {pid}")


def main() -> None:
    for p in (PT, PBP, ALIASES):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    if len(DOOMED_TO) != EXPECTED_DOOMED:
        raise AssertionError(f"{len(DOOMED_TO)} doomed ids listed, expected {EXPECTED_DOOMED}")
    merge_persons_truth()
    remap_placements()
    repoint_and_add_aliases()
    postconditions()
    for path, text in PENDING.items():
        path.write_text(text, encoding="utf-8")
    print(f"Merged {EXPECTED_DOOMED} duplicate rows")


if __name__ == "__main__":
    main()
