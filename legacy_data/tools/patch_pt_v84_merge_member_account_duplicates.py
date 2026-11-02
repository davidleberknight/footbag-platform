#!/usr/bin/env python3
"""
patch_pt_v84_merge_member_account_duplicates.py

Merge four duplicate person rows, each into the record of the same player that
holds the player's legacy account, and give one more record its account and its
correct spelling.

Each doomed row is the player's fuller or longer name, minted as its own person,
so the player's results are split across two public pages and the copy carries no
account link and can never be claimed. In each pair the account the survivor
holds bears the doomed row's own name, which is what makes them one human:

  Nicholas Laroche (33009012) -> Nick Laroche (baab18da), account 34177
    "Nicholas Laroche"; both Montreal-area results.
  Allen Gumasing Paule (2ffa9d66) -> Allen Paule (66b159b0), account 83756
    "Allen Gumasing Paule"; the two records never appear at one event.
  Jean-Marie Letort (43ac12c4) -> Jean Letort (8e1f2923), account 83156
    "Jean-Marie Letort"; at the one event they share they played different
    disciplines.
  Anthony Tony Ritz (f861dfae) -> Tony Ritz (68096dad), account 81222
    "Anthony Ritz", Cleveland; they share four events, never one discipline.

  Rafal Andryka (e9cc5378) takes account 66397 "Rafał Andryka" (Warszawa) through
  the member-id supplement and its correct spelling, keeping "Rafal Andryka" as an
  alias. No other Andryka exists; the account name carries the letter the results
  lost.

The survivor's name stays as it is. Every doomed row owns placements in the lock,
player and team rows; they move to the survivor, as in the v81 merge.

Operations:
  Persons_Truth_Final.csv       survivor absorbs the doomed rows' player ids, and
                                gains their spellings in player_names_seen and
                                aliases_presentable; the doomed rows are deleted;
                                Rafal Andryka is renamed Rafał Andryka
  Placements_ByPerson.csv       the doomed person's own rows move to the survivor;
                                team rows have the doomed id replaced in
                                team_person_key, and their display text, which is
                                source text, stays; Andryka's rows take the new
                                spelling
  person_aliases.csv            alias rows naming a doomed id point at the
                                survivor; every doomed spelling, and Rafal
                                Andryka, gains an alias row unless one already
                                resolves to the survivor
  member_id_supplement.csv      Rafal Andryka's account row is added

Each file is rewritten line by line: every other line is copied through byte for
byte. Every file is rewritten in memory and checked before any is written. A
second run stops on its pre-condition checks rather than compounding the edit;
checking out the four files is the rollback.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_pt_v84_merge_member_account_duplicates.py
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
SUPPLEMENT = ROOT / "inputs" / "identity_lock" / "member_id_supplement.csv"
DELIM = " | "
NOTE = ("fuller name of the same player; minted as an unclaimable duplicate "
        "and merged into the record holding the player's account")
RENAME_NOTE = "spelling without the Polish letter; same player"
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
    Merge("baab18da-920b-51d7-984d-688c23e82219", "Nick Laroche",
          [("33009012-7a6b-5a0f-9ab6-308651d244d3", "Nicholas Laroche")]),
    Merge("66b159b0-39cb-5ddc-b1df-fc2dfeba0b02", "Allen Paule",
          [("2ffa9d66-7e6c-5044-bcbe-7e448a973528", "Allen Gumasing Paule")]),
    Merge("8e1f2923-dd1a-5e9a-95e2-d99c720b065c", "Jean Letort",
          [("43ac12c4-b074-55ec-be51-6858775ac7c7", "Jean-Marie Letort")]),
    Merge("68096dad-ee3a-5325-9083-13e66c962bd3", "Tony Ritz",
          [("f861dfae-a8c1-5b93-9f5e-c82a3b7c76bf", "Anthony Tony Ritz")]),
    Merge("e9cc5378-aa20-5b2c-af79-e8e609a11a3c", "Rafal Andryka", [],
          canon_post="Rafał Andryka"),
]

# Doomed rows that own placements in the lock: (player rows, team rows).
OWNS_PLACEMENTS = {
    "33009012-7a6b-5a0f-9ab6-308651d244d3": (1, 1),
    "2ffa9d66-7e6c-5044-bcbe-7e448a973528": (3, 3),
    "43ac12c4-b074-55ec-be51-6858775ac7c7": (4, 4),
    "f861dfae-a8c1-5b93-9f5e-c82a3b7c76bf": (23, 20),
}
EXPECTED_DOOMED = 4

SUPPLEMENT_ROWS = [
    ("e9cc5378-aa20-5b2c-af79-e8e609a11a3c", "66397",
     "http://www.footbag.org/members/profile/66397",
     "Rafał Andryka; the only Andryka; account name carries the letter the results lost"),
]

DOOMED_TO = {pid: m for m in MERGES for pid, _ in m.doomed}
RENAMED = {m.survivor_pid: m for m in MERGES if m.canon_post}


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
            ids |= set(_pipe(d["player_ids_seen"])) - {pid}
            names.add(canon)
            presentable.add(canon)
        if m.canon_post:
            names.add(m.canon_pre)
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
    renamed = 0
    for line in lines[1:]:
        hit = [pid for pid in DOOMED_TO if pid in line]
        rename = [pid for pid in RENAMED if pid in line]
        if not hit and not rename:
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
        for pid in rename:
            if r["person_id"] == pid:
                r["person_canon"] = RENAMED[pid].canon
                r["norm"] = RENAMED[pid].canon.lower()
                renamed += 1
        out.append(_emit([r[h] for h in header]))
    for pid, expected in OWNS_PLACEMENTS.items():
        if tuple(moved[pid]) != expected:
            raise AssertionError(f"placements for {pid}: moved {moved[pid]}, expected {expected}")
    PENDING[PBP] = "\n".join(out)
    total = [sum(v[i] for v in moved.values()) for i in (0, 1)]
    print(f"{PBP.relative_to(ROOT)}: {total[0]} player and {total[1]} team row(s) moved, "
          f"{renamed} row(s) renamed")


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
        elif r["person_id"] in RENAMED:
            r["person_canon"] = RENAMED[r["person_id"]].canon
            line = _emit([r[h] for h in header])
            repointed += 1
        resolves.setdefault(normalize_name(r["alias"]), r["person_id"])
        out.append(line)
    added = 0
    wanted = [(m, spelling, NOTE) for m in MERGES for _, spelling in m.doomed]
    wanted += [(m, m.canon_pre, RENAME_NOTE) for m in RENAMED.values()]
    for m, spelling, note in wanted:
        key = normalize_name(spelling)
        if key == normalize_name(m.canon):
            continue
        owner = resolves.get(key)
        if owner == m.survivor_pid:
            continue
        if owner is not None:
            raise AssertionError(f"alias {spelling!r} already resolves to {owner}, not {m.survivor_pid}")
        out.append(_emit([spelling, m.survivor_pid, m.canon, "verified", note]))
        resolves[key] = m.survivor_pid
        added += 1
    out.append("")
    PENDING[ALIASES] = "\n".join(out)
    print(f"{ALIASES.relative_to(ROOT)}: {repointed} alias row(s) repointed, {added} added")


def add_supplement_rows() -> None:
    lines = _lines(SUPPLEMENT)
    existing = {line.split(",", 1)[0] for line in lines[1:] if line}
    taken = {next(csv.reader([line]))[1] for line in lines[1:] if line}
    body = [line for line in lines if line]
    for pid, member_id, url, note in SUPPLEMENT_ROWS:
        if pid in existing:
            raise AssertionError(f"supplement already links {pid} (already patched?)")
        if member_id in taken:
            raise AssertionError(f"supplement already gives account {member_id} to another person")
        body.append(_emit([pid, member_id, url, note]))
    PENDING[SUPPLEMENT] = "\n".join(body) + "\n"
    print(f"{SUPPLEMENT.relative_to(ROOT)}: {len(SUPPLEMENT_ROWS)} row(s) added")


def postconditions() -> None:
    for path, text in PENDING.items():
        if path == SUPPLEMENT:
            continue
        for pid in DOOMED_TO:
            if pid in text:
                raise AssertionError(f"{path.name} would still name doomed id {pid}")


def main() -> None:
    for p in (PT, PBP, ALIASES, SUPPLEMENT):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    if len(DOOMED_TO) != EXPECTED_DOOMED:
        raise AssertionError(f"{len(DOOMED_TO)} doomed ids listed, expected {EXPECTED_DOOMED}")
    merge_persons_truth()
    remap_placements()
    repoint_and_add_aliases()
    add_supplement_rows()
    postconditions()
    for path, text in PENDING.items():
        path.write_text(text, encoding="utf-8")
    print(f"Merged {EXPECTED_DOOMED} duplicate rows and renamed {len(RENAMED)} record(s)")


if __name__ == "__main__":
    main()
