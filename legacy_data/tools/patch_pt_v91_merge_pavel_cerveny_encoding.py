#!/usr/bin/env python3
"""
patch_pt_v91_merge_pavel_cerveny_encoding.py

Merge "Pavel Èervený" into Pavel Cerveny, and record the ruling.

"Pavel Èervený" is "Pavel Červený" with its first letter damaged in encoding: the
Czech "Č" is byte C8 in the Central European code page, and that byte read as
Western European is "È". The two Czech Championship pages that carry it, 2010
(event 1286644859) and 2013 (event 1379414806), print the damaged form, and it was
minted as its own person with three results: 2010 Net Singles 3rd, 2010 Open
Singles Freestyle 8th, 2013 Routines 7th.

The evidence is beyond the name. On the same 2010 page, "Dexter a Pavel Èervený"
won Net Doubles, and the team-correction list already names that partner Pavel
Cerveny, the established record, whose correct spelling "Pavel Červený" is
already its alias. The established record has 62 placements over 2001 to 2022,
Czech events throughout, and never appears in the same discipline of one event as
the damaged record.

The survivor is the established record and keeps its name. The damaged spelling
becomes an alias, so the resolver sends it to the survivor, but it is not added to
the presentable aliases: it is not a name the player uses.

Operations:
  Persons_Truth_Final.csv       the survivor absorbs the doomed row's player id and
                                spelling seen; the doomed row is deleted
  Placements_ByPerson.csv       a doomed person's own rows move to the survivor; team
                                rows have the doomed id replaced in team_person_key
  Person_Display_Names_v1.csv   a row naming a doomed id follows the survivor
  person_aliases.csv            rows naming a doomed id follow the survivor; each
                                doomed spelling gains a row unless one resolves
  identity_review_queue.csv     the ruling

Each file is rewritten line by line: every other line is copied through byte for
byte. Every file is rewritten in memory and checked before any is written. A
second run stops on its pre-condition checks rather than compounding the edit;
checking out the five files is the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v91_merge_pavel_cerveny_encoding.py
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
NOTE = "the same name damaged in encoding; ruled one person on evidence beyond the name"
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
    Merge("23462c9a-29d4-578f-9cfc-19d9ba086f45", "Pavel Cerveny", "c9c0796f-1196-5645-8108-c00564aed62e", "Pavel Èervený", 3, 0,
          "One person: the damaged spelling is Pavel Červený read in the wrong code page. "
          "On the 2010 Czech Championship page his Net Doubles win is already corrected to Pavel Cerveny, "
          "and the two records never meet in one discipline."),
]
EXPECTED_DOOMED = 1
DOOMED_TO = {m.doomed_pid: m for m in MERGES}

# Rulings with no merge: (provisional name, lock name, lock pid, reason)
RECORD_ONLY: list[tuple[str, str, str, str]] = []


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
        presentable = set(_pipe(s["aliases_presentable"])) | set(_pipe(d["aliases_presentable"]))
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
