#!/usr/bin/env python3
"""
patch_pt_v80_merge_polish_czech_character_loss.py

Merge nine duplicate person rows, each into the established record of the same
Polish or Czech player.

Every doomed row is the player's own name with one letter lost downstream of the
crawl: the "ł" of Michał, Paweł and Rafał, the "i" of Michal, or the "Š" and "š"
of Tomáš Šolc. Each was minted as its own person, so the player's results are
split across two or three public pages, and the damaged twin carries no account
link and can never be claimed. The alias registry then pinned each damaged
spelling to its own twin, which is what kept the split in place.

The maintainer ruled every pair the same person. The evidence: the Klimczak and
Rog twins share 16 events with their established record, the Biarda twins 2 and
1, the Andryka twins 3; no pair ever appears in the same discipline of one event,
where two different people would collide. The Rytelewski, Ulewicz and Šolc pairs
share no event either way, and rest on the name, the country and overlapping
years.

The survivor is the record holding the player's legacy account (Klimczak, Rog,
Biarda), and otherwise the spelling with no letter missing. Names stay as they
are; restoring the diacritics is a separate naming decision.

Eight doomed rows own placements in the lock, player and team rows both; they
move to the survivor, as in the v79 merge. The ninth, the "Michał Rg" stub, owns
none: its one result comes from the result stream and re-attributes through the
alias registry on the next export.

Operations:
  Persons_Truth_Final.csv       survivor absorbs the doomed rows' player ids, and
                                gains their spellings in player_names_seen and
                                aliases_presentable; the doomed rows are deleted
  Placements_ByPerson.csv       the doomed person's own rows move to the survivor;
                                team rows have the doomed id replaced in
                                team_person_key, and their display text, which is
                                source text, stays
  person_aliases.csv            alias rows naming a doomed id point at the
                                survivor; every doomed spelling gains an alias row
                                unless one already resolves to the survivor
  person_country_overrides.csv  each doomed row's line is deleted

Each file is rewritten line by line: every other line is copied through byte for
byte. Every file is rewritten in memory and checked before any is written. A
second run stops on its pre-condition checks rather than compounding the edit;
checking out the four files is the rollback.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_pt_v80_merge_polish_czech_character_loss.py
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
NOTE = ("character-loss variant of the same player; minted as an unclaimable "
        "duplicate and merged into the established record")
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
    Merge("b980fe51-dd4b-54fd-bb60-21cbb482f674", "Michal Klimczak",
          [("71b15435-b697-536a-8886-7d68c1369069", "Micha Klimczak")]),
    Merge("392ef8ff-d969-5917-8bc5-176805ecb787", "Michal Rog",
          [("538eeaf9-7aee-59d0-9904-a20958e74a26", "Micha Rog"),
           ("8a35798f-b5f5-5230-91fa-55f088992e35", "Michał Rg")]),
    Merge("437d9bc1-f872-5687-9191-689dccedb6d0", "Michal Biarda",
          [("23c0d2b5-bc9c-55f0-b40d-d4d408c7ef0f", "Micha Biarda"),
           ("f202bf60-2cad-5de4-87b2-565e561ddd61", "Mchal Biarda")]),
    Merge("e9cc5378-aa20-5b2c-af79-e8e609a11a3c", "Rafal Andryka",
          [("50b0eab9-c869-55ed-a975-80560a476c30", "Rafa Andryka")]),
    Merge("0fb0d143-7399-55de-ac21-58b2f4227fbf", "Pawel Rytelewski",
          [("3f2f6896-022b-57db-af84-ae4cc6139b32", "Pawe Rytelewski")]),
    Merge("a3624554-d6f1-5b57-8aa3-7e812b54ea35", "Pawel Ulewicz",
          [("0df0b7f6-27cd-52d0-b6cf-dc8298d71c27", "Pawe Ulewicz")]),
    Merge("a9a940f8-ea34-598b-a8a7-b64548c7c5c9", "Tomas Solc",
          [("a892a638-893e-5231-b1e9-8b3b3b60345c", "Tomá olc")]),
]

# Doomed rows that own placements in the lock: (player rows, team rows).
OWNS_PLACEMENTS = {
    "71b15435-b697-536a-8886-7d68c1369069": (39, 8),
    "538eeaf9-7aee-59d0-9904-a20958e74a26": (38, 2),
    "23c0d2b5-bc9c-55f0-b40d-d4d408c7ef0f": (27, 0),
    "f202bf60-2cad-5de4-87b2-565e561ddd61": (1, 0),
    "50b0eab9-c869-55ed-a975-80560a476c30": (2, 5),
    "3f2f6896-022b-57db-af84-ae4cc6139b32": (9, 0),
    "0df0b7f6-27cd-52d0-b6cf-dc8298d71c27": (2, 0),
    "a892a638-893e-5231-b1e9-8b3b3b60345c": (1, 0),
}
EXPECTED_DOOMED = 9

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
