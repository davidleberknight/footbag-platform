#!/usr/bin/env python3
"""
patch_pt_v81_merge_spelling_variant_pairs.py

Merge seventeen duplicate person rows, each into the established record of the
same player.

Each doomed row is the player's name with one letter dropped, added or slipped:
a typing slip ("Crag Sturgess", "Michiael Lamberjohann"), a letter lost from a
Polish name ("Krzystof Sobotka"), or a doubled or dropped consonant ("Jan
Brekkle", "Matthias Blau"). Each was minted as its own person, so the player's
results are split across two public pages, and the copy carries no account link
and can never be claimed.

The widened character-loss check reported these pairs, and the maintainer ruled
each one the same person. The evidence for every pair: the same country, at
least one event both records appear at, and never the same discipline of one
event, where two different people would collide.

The survivor is the record holding the player's legacy account (Schillem,
Rambaud, Brekle, Lamberjohann), otherwise the record with more events, and
otherwise the correct spelling: Dylan Govender survives over the misspelt
"Dyalan Govender" although the misspelling carries more events, and Torsten
Künzel over Thorsten Künzel on the larger record. Names stay as they are.

Every doomed row owns placements in the lock, player or team rows; they move
to the survivor, as in the v80 merge.

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
    footbag_venv/bin/python tools/patch_pt_v81_merge_spelling_variant_pairs.py
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
    Merge("20e4a023-1bb9-5d19-a6dc-73da6eb30a8d", "Anne Miller",
          [("40cdf712-ab85-50f7-bf64-1ef644c26c8d", "Ann Miller")]),
    Merge("6d8f8a3e-92a1-565d-b38d-53814572633f", "Cathy Guenther",
          [("0c288683-68be-5ecd-ab70-942cec240b88", "Cathey Guenther")]),
    Merge("bd1ac97c-6c20-5bcd-9fbd-f5279f4c22bf", "Chris Siebert",
          [("7c8a958d-74ca-5038-a961-4455fde610d8", "Chris Sieber")]),
    Merge("b6e28eb4-9de6-52a6-bde7-4ffaaa488933", "Christoph Alexander",
          [("6814ebbf-d3d7-5489-b71b-9f4128847219", "Cristoph Alexander")]),
    Merge("386d6a37-4682-59e5-8f16-572f674bf3b5", "Craig Sturgess",
          [("cd310dce-75af-57fb-87f1-ee59478ae6ba", "Crag Sturgess")]),
    Merge("c29c4aa7-5b1e-54d1-9435-2a45edfd669c", "Christopher Schillem",
          [("5a81a6d9-0309-5dc5-aaac-38ef59d8d4ac", "Cristopher Schillem")]),
    Merge("2254773e-8e01-5286-8750-460d2f1a250e", "Dave Schoch",
          [("50f10965-320f-5715-a56c-47b9fb8033b9", "Dave Shoch")]),
    Merge("9dd1729e-cd7f-5412-93ee-f08166e75fc7", "David Rambaud",
          [("387c0c9e-328c-5f7b-a6a4-94b5a3f30767", "David Ramaud")]),
    Merge("63e87d1c-3a6e-511e-af23-9586b873217f", "Dobromir Markov",
          [("e367f1b8-3d6f-58b7-9455-edb96a0f8ec7", "Doromir Markov")]),
    Merge("16a8976e-c728-586a-835b-08b5255a744c", "Dylan Govender",
          [("1739ca69-640a-52e9-8266-1a96cc39ca49", "Dyalan Govender")]),
    Merge("49ad435e-3398-59da-985c-65ce0612bdd3", "Jan Brekle",
          [("5c7846a6-7149-53e7-bf56-39ce1f611deb", "Jan Brekkle")]),
    Merge("ceb19bce-3ebd-5c57-bebb-aa545ba79aa6", "Jon Hayduk",
          [("5d4624fd-09c1-5936-ab08-91567df09453", "John Hayduk")]),
    Merge("ddf2f704-a4d2-5653-a82a-45987d37645c", "Krzysztof Sobótka",
          [("45df9516-d601-57df-9502-60cb1b3ed1bb", "Krzystof Sobotka")]),
    Merge("401af1f3-a976-5403-9740-210e2849f159", "Maciej Niczyporuk",
          [("20dd0304-5140-59de-95a0-96c37289f31e", "Marciej Niczyporuk")]),
    Merge("f4d65667-f58f-5213-a2a3-6b985aa50dc5", "Mathias Blau",
          [("3bb4acdb-16bf-56d5-bfbe-b2a68982a617", "Matthias Blau")]),
    Merge("f73415ed-f8d8-5b37-a56c-87fb2f93422a", "Michael Lamberjohann",
          [("db93ccb4-3986-5b10-81c8-416cfea6ac09", "Michiael Lamberjohann")]),
    Merge("10d47e03-3a3a-5b84-a4d7-66ed9ad14212", "Torsten Künzel",
          [("a1656d84-77f3-5b7b-92e9-5e2b61faac39", "Thorsten Künzel")]),
]

# Doomed rows that own placements in the lock: (player rows, team rows).
OWNS_PLACEMENTS = {
    "40cdf712-ab85-50f7-bf64-1ef644c26c8d": (0, 1),
    "0c288683-68be-5ecd-ab70-942cec240b88": (0, 1),
    "7c8a958d-74ca-5038-a961-4455fde610d8": (1, 1),
    "6814ebbf-d3d7-5489-b71b-9f4128847219": (1, 0),
    "cd310dce-75af-57fb-87f1-ee59478ae6ba": (1, 0),
    "5a81a6d9-0309-5dc5-aaac-38ef59d8d4ac": (1, 0),
    "50f10965-320f-5715-a56c-47b9fb8033b9": (0, 1),
    "387c0c9e-328c-5f7b-a6a4-94b5a3f30767": (0, 1),
    "e367f1b8-3d6f-58b7-9455-edb96a0f8ec7": (0, 1),
    "1739ca69-640a-52e9-8266-1a96cc39ca49": (3, 0),
    "5c7846a6-7149-53e7-bf56-39ce1f611deb": (2, 0),
    "5d4624fd-09c1-5936-ab08-91567df09453": (0, 1),
    "45df9516-d601-57df-9502-60cb1b3ed1bb": (1, 0),
    "20dd0304-5140-59de-95a0-96c37289f31e": (1, 0),
    "3bb4acdb-16bf-56d5-bfbe-b2a68982a617": (4, 0),
    "db93ccb4-3986-5b10-81c8-416cfea6ac09": (0, 1),
    "a1656d84-77f3-5b7b-92e9-5e2b61faac39": (2, 1),
}
EXPECTED_DOOMED = 17

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
