#!/usr/bin/env python3
"""
patch_pt_v90_merge_first_name_pairs.py

Merge the short and long first-name pairs the maintainer ruled one person, and
record every ruling.

A name match alone is never an identity decision. Each pair below was ruled on
evidence beyond the name: shared events with no clash in a contest, shared doubles
partners, overlapping careers in one scene, or the same legacy account. Matt and
Matthew Kemmer share one contest, the 2019 Warsaw Shred 30, but that page lists the
contest twice (a final and a combined ranking), as it does for four other players,
so the clash is the page's, not two people's.

The survivor is the record that carries a legacy account, or else the one with
more placements, and keeps its name; the other spelling stays an alias.

Two rulings join a results record to a provisional record from the persons
master, which is not in the identity lock: Dan Greer and Daniel E. Greer, Dave
Hill and David J. Hill. They are recorded and nothing is merged.

Operations:
  Persons_Truth_Final.csv       each survivor absorbs its doomed rows' player ids and
                                spellings; the doomed rows are deleted
  Placements_ByPerson.csv       a doomed person's own rows move to the survivor; team
                                rows have the doomed id replaced in team_person_key
  Person_Display_Names_v1.csv   a row naming a doomed id follows the survivor
  person_aliases.csv            rows naming a doomed id follow the survivor; each
                                doomed spelling gains a row unless one resolves
  identity_review_queue.csv     the rulings

Each file is rewritten line by line: every other line is copied through byte for
byte. Every file is rewritten in memory and checked before any is written. A
second run stops on its pre-condition checks rather than compounding the edit;
checking out the five files is the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v90_merge_first_name_pairs.py
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
DISPLAY = ROOT / "inputs" / "identity_lock" / "Person_Display_Names_v1.csv"
ALIASES = ROOT / "overrides" / "person_aliases.csv"
REGISTER = ROOT / "overrides" / "identity_review_queue.csv"
DELIM = " | "
NOTE = "another name of the same player; ruled one person on evidence beyond the name"
PENDING: dict[Path, str] = {}


@dataclass
class Merge:
    survivor_pid: str
    canon: str
    doomed_pid: str
    doomed_canon: str
    player_rows: int
    team_rows: int
    reason: str


MERGES: list[Merge] = [
    Merge("184a06bb-be96-5120-9a7c-1676f2b01a2a", "Jean-Francois Lemieux", "c1f4a6a4-7905-5276-98df-cbad30981800", "JF Lemieux", 4, 3,
          "One person: 12 shared events with no clash and six shared doubles partners; JF is his initials."),
    Merge("76903021-2004-5979-8c93-8a3489c5c3ef", "Benjamin Kellman", "edb7ff85-0dae-5590-b5df-ac61cd472031", "Ben Kellman", 19, 4,
          "One person: three shared events with no clash and a shared doubles partner, Jim Hankins."),
    Merge("6f69628f-6e43-53b9-91a6-0bff36dc6ee7", "Christian Bock", "d38e79af-2f04-5a3a-8138-047a0f3e0733", "Chris Bock", 0, 2,
          "One person: two shared events with no clash, inside the years of the record carrying the account."),
    Merge("8069a4cf-1543-5a0a-bf83-92edff9e120f", "Maxime Boucoiran", "6afe2e47-df47-5055-bba0-0aa2341d43e0", "Max Boucoiran", 16, 2,
          "One person: two shared events with no clash and a shared doubles partner, Fred Touzelet."),
    Merge("4466afbd-a8d2-59c8-a46b-1108c4f1ea10", "Rob Creel", "b20bec33-66d4-5ea4-8f90-0c034479366f", "Robert Creel", 13, 6,
          "One person: two shared events with no clash and overlapping careers."),
    Merge("45b40a79-0205-5653-b18d-237dc54e3692", "Alex Bartsch", "baf55af8-3c88-5c65-95cf-12f3b2c7c390", "Alexander Bartsch", 1, 10,
          "One person: four shared doubles partners, both in Frankfurt."),
    Merge("760941c4-9426-56f1-ac79-e8ad3ce9cf98", "Andrew Ronald", "39bc6c51-d2e0-5930-8677-51828c12de14", "Andy Ronald", 10, 36,
          "One person: seven shared doubles partners and overlapping careers."),
    Merge("c312c02d-8a8c-5c73-8b68-65fc9e3fa453", "Benjamin Rochon", "d8510984-44e5-540a-b35c-56ffff178798", "Ben Rochon", 1, 1,
          "One person: a shared doubles partner, JF Lemieux, inside the same career."),
    Merge("59b9b60b-1697-54f8-98d1-eaed43e99f65", "Chris Löw", "c859420d-4487-5539-8a89-7fd09956d790", "Christian Löw", 5, 10,
          "One person: four shared doubles partners, both in Frankfurt."),
    Merge("646452e8-7ede-58d9-aa7d-f82c092800ad", "Chris Young", "1db3ad26-faf1-55bb-a75e-4e24d963827a", "Christopher Young", 0, 0,
          "One person: a shared doubles partner, Dirk Janssens, over the same years."),
    Merge("c8c1aeda-3257-5911-bb55-3b7621b47c6a", "Mariajose Silva", "565fd17a-2f78-5890-97ff-bd0093bf719e", "Maria J. Silva", 0, 0,
          "One person: the same 2024 event and a shared doubles partner, Hank Monges."),
    Merge("19099aed-193d-5d7c-a32a-0e94389d1262", "Matthew Quint", "66a19925-00c6-5da5-8b24-2bb656591603", "Matt Quint", 5, 4,
          "One person: a shared doubles partner, Cory Current, over the same years."),
    Merge("4184f9cc-a307-5b20-8676-670e751d7654", "Philippe Larose", "71acaaa9-0a92-5ad4-9f49-69354fdce72e", "Phil Larose", 0, 0,
          "One person: a shared doubles partner, Luc Legeault, inside the same career."),
    Merge("a0bcdd4a-2d77-522f-8f5c-b74c30ade8d2", "Thomas Sustrac", "0655a4b0-ee2c-5485-b7db-0ca8f6beaf0a", "Tom Sustrac", 4, 4,
          "One person: a shared doubles partner, Olivier Baillon, inside the same career."),
    Merge("552a9fb8-e63c-5f87-b431-06f68b0a1323", "Chris Gregory", "4d21720e-7b86-5713-8371-9e06ed75e8d5", "Christopher Gregory", 1, 2,
          "One person: a shared doubles partner, Russell Arseneault, inside the same career."),
    Merge("d03d053d-16e3-5132-ba7d-285956eaf3da", "Dave Spears", "9a3a39d5-cf0d-56a9-929d-fd6fa3b46ed8", "David Spears", 3, 4,
          "One person: a shared doubles partner, James Harley, inside the same career."),
    Merge("414acac1-acb2-58f9-9c40-c0f8a8f2d70c", "Fred Touzelet", "bfa81320-2dd7-5c54-85ed-98f8a778a4be", "Frédéric Touzelet", 4, 1,
          "One person: a shared doubles partner, Maxime Boucoiran, inside the same career."),
    Merge("56a992bb-b4d6-5e18-8b62-5f82b797fe3d", "Jean François Bélanger", "1869d5a4-7acd-5476-b98b-51639f451cee", "JF Bélanger", 0, 0,
          "One person: a shared doubles partner, Luka Weyler, inside the same career; JF is his initials."),
    Merge("56a992bb-b4d6-5e18-8b62-5f82b797fe3d", "Jean François Bélanger", "37846fec-cb32-5a52-9ab8-c3d1e2c9306b", "J-F Bélanger", 0, 0,
          "One person: a shared doubles partner, Luka Weyler, inside the same career; J-F is his initials."),
    Merge("5d63ebc3-688c-560b-8889-961694f1cebc", "Mike Gupton", "1130d6a6-a00f-5522-a518-df7c5bd25f3c", "Michael Gupton", 3, 5,
          "One person: two shared doubles partners, James Roberts and Tim Vozar, over the same years."),
    Merge("05e4717a-ad04-55b2-8739-64f00dd7be9a", "Thomas Whitworth", "48dc56d4-b77a-551c-a465-46993ebf06b6", "Tom Whitworth", 6, 8,
          "One person: a shared doubles partner, Mike Voightmann, over the same years."),
    Merge("3e78df68-5425-5d48-a88a-3bf59fe2934f", "Matt Kemmer", "f3627296-7396-580c-90ac-ad13b76da7b5", "Matthew Kemmer", 22, 0,
          "One person: two shared doubles partners, Maciej Niczyporuk and Rafal Kaleta, and overlapping careers. The one shared contest, the 2019 Warsaw Shred 30, is listed twice on its page."),
]
EXPECTED_DOOMED = 22
DOOMED_TO = {m.doomed_pid: m for m in MERGES}

# Rulings with no merge: (provisional name, lock name, lock pid, reason)
RECORD_ONLY = [
    ("Daniel E. Greer", "Dan Greer", "4e7dc073-b469-5740-821c-76e0ee26a3d1",
     "One person: the provisional record and the lock record carry the same legacy account. Nothing merged: the provisional record is not in the identity lock."),
    ("David J. Hill", "Dave Hill", "5cb79fb4-ab20-558f-b4a2-e7206c9f22df",
     "One person: the provisional record and the lock record carry the same legacy account. Nothing merged: the provisional record is not in the identity lock."),
]


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
    for _name, canon, pid, _reason in RECORD_ONLY:
        if pid not in by_pid or by_pid[pid]["person_canon"] != canon:
            raise AssertionError(f"record-only ruling: expected {canon!r} at {pid}")
    for m in MERGES:
        s = by_pid.get(m.survivor_pid)
        if s is None or s["person_canon"] != m.canon:
            raise AssertionError(f"survivor {m.survivor_pid}: expected {m.canon!r}")
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
        names = set(_pipe(s["player_names_seen"])) | set(_pipe(d["player_names_seen"])) | {m.doomed_canon}
        presentable = set(_pipe(s["aliases_presentable"])) | set(_pipe(d["aliases_presentable"])) | {m.doomed_canon}
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
    moved = {pid: [0, 0] for pid in DOOMED_TO}
    for line in lines[1:]:
        hit = [pid for pid in DOOMED_TO if pid in line]
        if not hit:
            out.append(line)
            continue
        r = _row(header, line)
        for pid in hit:
            m = DOOMED_TO[pid]
            touched = False
            if r["person_id"] == pid:
                r["person_id"] = m.survivor_pid
                r["person_canon"] = m.canon
                r["norm"] = m.canon.lower()
                moved[pid][0] += 1
                touched = True
            if pid in r["team_person_key"]:
                r["team_person_key"] = r["team_person_key"].replace(pid, m.survivor_pid)
                if not touched:
                    moved[pid][1] += 1
                touched = True
            if not touched:
                raise AssertionError(f"doomed id in an unexpected column: {line[:120]}")
        out.append(_emit([r[h] for h in header]))
    for m in MERGES:
        if tuple(moved[m.doomed_pid]) != (m.player_rows, m.team_rows):
            raise AssertionError(f"placements for {m.doomed_canon}: moved {moved[m.doomed_pid]}, "
                                 f"expected {(m.player_rows, m.team_rows)}")
    PENDING[PBP] = "\n".join(out)
    total = [sum(v[i] for v in moved.values()) for i in (0, 1)]
    print(f"{PBP.relative_to(ROOT)}: {total[0]} player and {total[1]} team row(s) moved")


def follow_display_names() -> None:
    lines = _lines(DISPLAY)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    changed = 0
    for line in lines[1:]:
        if not any(pid in line for pid in DOOMED_TO):
            out.append(line)
            continue
        r = _row(header, line)
        m = DOOMED_TO.get(r["effective_person_id"])
        if m is None:
            raise AssertionError(f"display names: doomed id in an unexpected column: {line[:120]}")
        r["effective_person_id"], r["person_canon"] = m.survivor_pid, m.canon
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
        if r["person_id"] in DOOMED_TO:
            m = DOOMED_TO[r["person_id"]]
            r["person_id"], r["person_canon"] = m.survivor_pid, m.canon
            line = _emit([r[h] for h in header])
            followed += 1
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
    print(f"{ALIASES.relative_to(ROOT)}: {followed} alias row(s) followed, {added} added")


def add_register_rows() -> None:
    lines = _lines(REGISTER)
    header = next(csv.reader([lines[0]]))
    body = [line for line in lines if line]
    existing = {frozenset((normalize_name(_row(header, line)["alias_name"]),
                           normalize_name(_row(header, line)["canon_name"]))) for line in body[1:]}
    next_number = max(int(_row(header, line)["pair_id"].split("-")[1]) for line in body[1:]) + 1
    rulings = [(m.doomed_canon, m.canon, m.doomed_pid, m.survivor_pid, m.reason + f" Merged into {m.canon}.")
               for m in MERGES]
    rulings += [(name, canon, "", pid, reason) for name, canon, pid, reason in RECORD_ONLY]
    for other, name, alias_pid, canon_pid, reason in rulings:
        key = frozenset((normalize_name(other), normalize_name(name)))
        if key in existing:
            raise AssertionError(f"register already rules {other!r} and {name!r} (already patched?)")
        row = {h: "" for h in header}
        row.update({
            "pair_id": f"R-{next_number}",
            "alias_name": other,
            "canon_name": name,
            "alias_pid": alias_pid,
            "canon_pid": canon_pid,
            "evidence_needed": "none",
            "status": "SAME",
            "notes": reason,
        })
        body.append(_emit([row[h] for h in header]))
        existing.add(key)
        next_number += 1
    PENDING[REGISTER] = "\n".join(body) + "\n"
    print(f"{REGISTER.relative_to(ROOT)}: {len(rulings)} ruled row(s) added")


def postconditions() -> None:
    for path, text in PENDING.items():
        if path == REGISTER:
            continue
        for pid in DOOMED_TO:
            if pid in text:
                raise AssertionError(f"{path.name} would still name doomed id {pid}")


def main() -> None:
    for p in (PT, PBP, DISPLAY, ALIASES, REGISTER):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    if len(DOOMED_TO) != EXPECTED_DOOMED:
        raise AssertionError(f"{len(DOOMED_TO)} doomed ids listed, expected {EXPECTED_DOOMED}")
    merge_persons_truth()
    remap_placements()
    follow_display_names()
    follow_and_add_aliases()
    add_register_rows()
    postconditions()
    for path, text in PENDING.items():
        path.write_text(text, encoding="utf-8")
    print(f"Merged {EXPECTED_DOOMED} duplicate rows, recorded {EXPECTED_DOOMED + len(RECORD_ONLY)} rulings")


if __name__ == "__main__":
    main()
