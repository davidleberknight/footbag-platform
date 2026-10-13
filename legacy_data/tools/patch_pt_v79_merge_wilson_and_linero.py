#!/usr/bin/env python3
"""
patch_pt_v79_merge_wilson_and_linero.py

Merge two duplicate person rows, each into the established record of the same
player.

  Michael Wilson (b29f908f) -> Mike Wilson (06eb1264)
    The 2000 Texas State Championships result. footbag.org's own registration
    pages for that event and for the 2001 Southern Regional link "Michael Wilson"
    to member profile 14094 (Michael G. Wilson, Fort Worth, Texas), and the
    results pages for the same events list him as Mike and Michael Wilson. One
    player; the record also takes his account link through the member-id
    supplement.

  Antonio Lineros (d5438c2d) -> Antonio Linero Castro (da631353)
    The Medellín player. "Lineros" appears only at the 2018 Copa Medellín and
    the 2019 MedeJam, both in Medellín, where the same results list him as
    Antonio Linero; the extra letter is a typing slip in the source.

Both doomed rows own player placements in the lock (Wilson one, Lineros two);
they move to the survivor, as in the v77 merge. Neither owns team placements,
alias rows or a country override.

Operations:
  Persons_Truth_Final.csv       survivor absorbs the doomed rows' player ids, and
                                gains their spellings in player_names_seen and
                                aliases_presentable; the doomed rows are deleted
  Placements_ByPerson.csv       the doomed person's own rows move to the survivor
  person_aliases.csv            every doomed spelling gains an alias row unless
                                one already resolves to the survivor
  person_country_overrides.csv  each doomed row's line is deleted (none today)

Each file is rewritten line by line: every other line is copied through byte for
byte. Every file is rewritten in memory and checked before any is written. A
second run stops on its pre-condition checks rather than compounding the edit;
checking out the four files is the rollback.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_pt_v79_merge_wilson_and_linero.py
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
COUNTRY = ROOT / "inputs" / "person_country_overrides.csv"
DELIM = " | "
NOTE = ("spelling variant of the same player; minted as an unclaimable duplicate "
        "and merged into the established record")
PENDING: dict[Path, str] = {}


@dataclass
class Merge:
    survivor_pid: str
    canon_pre: str
    doomed: list[tuple[str, str]]  # (pid, canon)
    canon_post: str = ""

    @property
    def canon(self) -> str:
        return self.canon_post or self.canon_pre


MERGES: list[Merge] = [
    Merge("06eb1264-0514-5ba6-80f4-a26ab9c0cec7", "Mike Wilson",
          [("b29f908f-e5f4-505d-a86b-7dc178a164b5", "Michael Wilson")]),
    Merge("da631353-0d65-5a29-9572-37f115385c15", "Antonio Linero Castro",
          [("d5438c2d-a43e-5124-a46a-6f0944785f00", "Antonio Lineros")]),
]

# Doomed rows that own placements in the lock: (player rows, team rows).
OWNS_PLACEMENTS = {
    "b29f908f-e5f4-505d-a86b-7dc178a164b5": (1, 0),
    "d5438c2d-a43e-5124-a46a-6f0944785f00": (2, 0),
}
EXPECTED_DOOMED = 2

DOOMED_TO = {pid: m for m in MERGES for pid, _ in m.doomed}


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
            raise AssertionError(f"survivor {m.survivor_pid} missing (already merged?)")
        if s["person_canon"] != m.canon_pre:
            raise AssertionError(f"survivor {m.survivor_pid}: expected {m.canon_pre!r}, got {s['person_canon']!r}")
        ids, names, presentable = set(_pipe(s["player_ids_seen"])), set(_pipe(s["player_names_seen"])), set(_pipe(s["aliases_presentable"]))
        for pid, canon in m.doomed:
            d = by_pid.get(pid)
            if d is None:
                raise AssertionError(f"doomed {pid} ({canon}) missing (already merged?)")
            if d["person_canon"] != canon:
                raise AssertionError(f"doomed {pid}: expected {canon!r}, got {d['person_canon']!r}")
            if d["legacyid"].strip():
                raise AssertionError(f"doomed {canon} carries a legacy account link")
            if d["exclusion_reason"].strip():
                raise AssertionError(f"doomed {canon} carries an exclusion")
            if _pipe(d["player_ids_seen"]) and pid not in OWNS_PLACEMENTS:
                raise AssertionError(f"doomed {canon} carries player ids")
            # A row minted as a new person lists its own person id as its only
            # player id; that is not a parser player id and does not survive it.
            ids |= set(_pipe(d["player_ids_seen"])) - {pid}
            names.add(canon)
            presentable.add(canon)
        if m.canon_post:
            presentable.add(m.canon_pre)
            s["person_canon"] = m.canon_post
            s["person_canon_clean"] = m.canon_post
        presentable.discard(m.canon)
        s["player_ids_seen"] = DELIM.join(sorted(ids))
        s["player_names_seen"] = DELIM.join(sorted(names))
        s["aliases_presentable"] = DELIM.join(sorted(presentable))
    survivors = {m.survivor_pid: m for m in MERGES}
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
    print(f"{PT.relative_to(ROOT)}: {len(MERGES)} survivors updated, {dropped} rows deleted")


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
                raise AssertionError(f"placements: {DOOMED_TO[pid].canon} doomed id {pid} unexpectedly present")
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
    print(f"{PBP.relative_to(ROOT)}: " + ", ".join(f"{DOOMED_TO[p].doomed[-1][1]} {v[0]} player and {v[1]} team row(s) moved" for p, v in moved.items()))


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
        for _, spelling in m.doomed:
            key = normalize_name(spelling)
            if key == normalize_name(m.canon):
                continue
            owner = resolves.get(key)
            if owner == m.survivor_pid:
                continue
            if owner is not None:
                raise AssertionError(f"alias {spelling!r} already resolves to {owner}, not {m.survivor_pid}")
            out.append(_emit([spelling, m.survivor_pid, m.canon, "verified", NOTE]))
            resolves[key] = m.survivor_pid
            added += 1
    out.append("")
    PENDING[ALIASES] = "\n".join(out)
    print(f"{ALIASES.relative_to(ROOT)}: {repointed} alias row(s) repointed, {added} added")


def drop_country_overrides() -> None:
    lines = _lines(COUNTRY)
    out = [lines[0]]
    dropped = 0
    for line in lines[1:]:
        if line.split(",", 1)[0] in DOOMED_TO:
            dropped += 1
            continue
        out.append(line)
    PENDING[COUNTRY] = "\n".join(out)
    print(f"{COUNTRY.relative_to(ROOT)}: {dropped} line(s) deleted")


def postconditions() -> None:
    for path, text in PENDING.items():
        for pid in DOOMED_TO:
            if pid in text:
                raise AssertionError(f"{path.name} would still name doomed id {pid}")


def main() -> None:
    for p in (PT, PBP, ALIASES, COUNTRY):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    if len(DOOMED_TO) != EXPECTED_DOOMED:
        raise AssertionError(f"{len(DOOMED_TO)} doomed ids listed, expected {EXPECTED_DOOMED}")
    merge_persons_truth()
    remap_placements()
    repoint_and_add_aliases()
    drop_country_overrides()
    postconditions()
    for path, text in PENDING.items():
        path.write_text(text, encoding="utf-8")
    print(f"Merged {EXPECTED_DOOMED} duplicate rows into {len(MERGES)} established records")


if __name__ == "__main__":
    main()
