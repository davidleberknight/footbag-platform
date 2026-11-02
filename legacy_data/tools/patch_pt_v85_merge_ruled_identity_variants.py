#!/usr/bin/env python3
"""
patch_pt_v85_merge_ruled_identity_variants.py

Merge twenty-seven duplicate person rows, each into the record of the same
player, resolve seven unresolved spellings, and record the pairs ruled apart.

Each doomed row is the player under another name: a fuller or shorter given name,
a former or second surname, or a typing slip. Each was minted as its own person,
so the player's results are split across two public pages and the copy carries no
account link and can never be claimed.

A name match alone is never an identity decision. The maintainer ruled every pair
below on evidence beyond the name:

  Registration links on the legacy site, where the account the player registered
  under sits beside results published under the other name:
    Carlos Funes -> Carlos Acosta, account 82150 "Carlos Manuel Acosta Funes"
    Joey Vu -> Joey Monti, account 82241 "Joey Monti-Vu"
    Zhong Jia Yong -> Zhong Jia Yao, account 83723, the only Zhong registered for
      the 2019 Open Request Contest that "Yong" placed in

  An account bearing both names, with careers that fit:
    Emmanuelle Bouvier -> Emmanuelle Vincendeau
    François Depatie -> Francois Pelletier
    Małgorzata Nycz -> Gosia Debska
    Jani Sakari Markkanen -> Jani Säntti
    Jana Sassakova -> Jana Riisalo
    David Tibocha -> David Castillo
    Ramon Zambrano De La Torre -> Ramón Zambrano
    Ronald Ańez Mora -> Ronald Ańez
    Roberto Abel -> Roberto Da Silva, also through their partner Eduardo Martinez

  A short and long form of one name on one account, never in one discipline of an
  event:
    Benjamin Babyak -> Ben Babyak
    Christopher Cleaver -> Chris Cleaver
    David L. Bernard III -> Dave Bernard
    Dave Boatz Beyers -> David Beyers
    Greg Raymond -> Gregory Raymond
    Matthew Cross -> Matt Cross
    Mike Lopez -> Michael Lopez
    Michael Scheele -> Mike Scheele
    Michael Bellman -> Mike Bellmen
    Olivier B.-Bergé -> Olivier Berthiaume
    Simon Voß -> Simon Voss

  Two records of one player:
    Jacob Wren -> Jake Wren, two accounts sharing a city and a birth date
    Ben Benulis -> Benjamin Benulis, who holds account 71999; the same events in
      2007, never one discipline
    Vašek Klouda -> Vaclav Klouda; the other places of the same event, and Vasek is
      already his alias
    Yulia Klouda -> Julia Klouda, who holds account 66133; the same partners

Each unresolved spelling has no person row, only placements. An alias row resolves
it at the seed build, so no placement moves:
    Uli Cazzaro -> Ulli Cazzaro, and Stephan Müller -> Stefan Müller: the Swiss
      Ranking of the same contest carries each at the matching place
    Said Shaheen -> Saiid Shaheen, Leimar Romero -> Leimar Salas (account "Leimar
      Andrea Salas Romero"), Taku Muira -> Taku Miura: other disciplines of the
      same event
    Timothy Kersey -> Tim Kersey: account 83463 is registered at the 2021 event as
      Timothy and is in Alabama, where Tim's 1997 result is
    Tom Bergamasco -> Thomas Bergamasco: the same partner, Jim Hankins

The survivor is the record holding the account, otherwise the record carrying the
current name, otherwise the record with more events. Names stay as they are.

Operations:
  Persons_Truth_Final.csv       survivor absorbs the doomed rows' player ids, and
                                gains their spellings in player_names_seen and
                                aliases_presentable; the doomed rows are deleted
  Placements_ByPerson.csv       the doomed person's own rows move to the survivor;
                                team rows have the doomed id replaced in
                                team_person_key, and their display text, which is
                                source text, stays
  Person_Display_Names_v1.csv   rows naming a doomed id point at the survivor
  person_aliases.csv            alias rows naming a doomed id point at the
                                survivor; every doomed spelling and unresolved
                                spelling gains an alias row unless one already
                                resolves to the survivor
  identity_review_queue.csv     the pairs ruled apart, or that the evidence cannot
                                settle, gain a ruled row

Each file is rewritten line by line: every other line is copied through byte for
byte. Every file is rewritten in memory and checked before any is written. A
second run stops on its pre-condition checks rather than compounding the edit;
checking out the five files is the rollback.

Usage (from legacy_data/):
    footbag_venv/bin/python tools/patch_pt_v85_merge_ruled_identity_variants.py
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


MERGES: list[Merge] = [
    Merge("67f14498-b4d7-54f4-ad8a-3a4d95ccbd24", "Jake Wren",
          "1bfb569c-6400-5fbb-aca1-66b0cfb3abc3", "Jacob Wren"),
    Merge("7afe03a1-08a3-5ea2-a884-f56589aeea38", "Benjamin Benulis",
          "0f04687b-1e6c-597f-be61-6edb9e8e6bfa", "Ben Benulis"),
    Merge("98ce4e04-05ca-56ca-b8c6-83f51c164c89", "Vaclav Klouda",
          "8b1e5ce1-b6be-58dd-90c3-02bafdb34ec6", "Vašek Klouda"),
    Merge("7bd253f8-dc8a-5e21-a2e3-b27899ebc2e2", "Julia Klouda",
          "3b0979c2-55ac-56e0-9149-7507c0e2ca59", "Yulia Klouda"),
    Merge("da5c610b-299f-521a-8d5a-8281ddb1810c", "Carlos Acosta",
          "cfa3e939-86f8-5927-bc67-1901278a4b52", "Carlos Funes"),
    Merge("f839fd7d-f3d4-5582-a47d-19838389afab", "Joey Monti",
          "320a02aa-961a-57f9-a2e5-81fe6fec03e1", "Joey Vu"),
    Merge("cd277323-fc63-5adf-bb0c-e05ab57a46e8", "Roberto Da Silva",
          "2be1eb36-7b4c-582a-a402-8f313efa2d75", "Roberto Abel"),
    Merge("4420f12f-009b-574a-8d87-52aa7a7d76e3", "Zhong Jia Yao",
          "42587bcd-8af7-5944-b21e-5c6aadf6a517", "Zhong Jia Yong"),
    Merge("8e905f65-2782-500e-89d9-73bf26d459bc", "Emmanuelle Vincendeau",
          "620a8311-2a3a-5cdb-a5e3-c83a82f0bff1", "Emmanuelle Bouvier"),
    Merge("9d9b7019-1c24-54b4-8dfb-75bc689657e2", "Francois Pelletier",
          "87e0d502-d749-53dd-997b-f266371d1474", "François Depatie"),
    Merge("a737859a-35f6-51c8-9cd1-d5f54f88b8dd", "Gosia Debska",
          "e6f5c3f9-b642-52a2-a6b4-9d8037fa5a83", "Małgorzata Nycz"),
    Merge("bd8f51fb-7188-58b6-96ef-720edd7c8a61", "Jani Säntti",
          "0dee73bb-caed-5f5c-9c20-5ea946939871", "Jani Sakari Markkanen"),
    Merge("f91f76bc-1b7b-5965-a815-3d18ddc87759", "Jana Riisalo",
          "02095322-bd6e-52a6-9f2d-6b5a7a527eae", "Jana Sassakova"),
    Merge("d38d6a95-920f-5c38-86a9-1c291109c12c", "David Castillo",
          "d45c75c4-4da0-5ee6-a4da-b1218a2201a7", "David Tibocha"),
    Merge("f70bd897-f2ee-5333-ad21-fb153c1647ab", "Ramón Zambrano",
          "d47d35c4-948a-5380-9c9f-98accc2ed1e4", "Ramon Zambrano De La Torre"),
    Merge("eb607281-73de-5a25-962f-f507d49e01bb", "Ronald Ańez",
          "3c0be1ae-b4d4-5551-b058-bc7bf0c8914e", "Ronald Ańez Mora"),
    Merge("c5297bc0-0f46-5f3f-b165-c6f4901f8838", "Ben Babyak",
          "ede0da6c-0e27-576f-abe5-6a20a004343b", "Benjamin Babyak"),
    Merge("ae007583-9bf0-520a-ba7c-b2e6f52b12ef", "Chris Cleaver",
          "7b686f60-43cf-5481-9e20-6115df175f9a", "Christopher Cleaver"),
    Merge("e8e44ba7-c704-5b37-bb6b-1c97ec405c21", "Dave Bernard",
          "e48deceb-0598-5cc6-9d85-3ca95598865c", "David L. Bernard III"),
    Merge("7f79d397-3a3f-5fa1-8af5-4e789480098d", "David Beyers",
          "f11252e7-1d3c-5e22-9819-32bdb69775de", "Dave Boatz Beyers"),
    Merge("debefe3b-6054-5ee1-88e4-b9ac7f00f3cb", "Gregory Raymond",
          "abd2fe08-1d5c-59bb-8c19-5ccd5a3be6e0", "Greg Raymond"),
    Merge("bc7525cb-8eb2-5cf2-a11e-1b072fede923", "Matt Cross",
          "0f49163a-1b6c-5734-b255-f1667058719f", "Matthew Cross"),
    Merge("5aea8767-8f47-540d-80f3-69f67abace35", "Michael Lopez",
          "778326dc-8646-52dc-82c4-f0c274a2b447", "Mike Lopez"),
    Merge("ee312ddb-1d0b-5e91-b59f-1860309e0c67", "Mike Scheele",
          "1462d41b-49bb-5174-9994-db350df37f4c", "Michael Scheele"),
    Merge("3207e42c-e99e-58e4-9c8c-d722dec54bed", "Mike Bellmen",
          "6ed2ffbb-a3ce-5313-b045-2a382da11dd3", "Michael Bellman"),
    Merge("78e060c9-3854-5b49-a5da-130392b333ea", "Olivier Berthiaume",
          "8842db90-a28e-52d6-87e1-8466adcc548a", "Olivier B.-Bergé"),
    Merge("04253241-2763-57c5-a946-fa08f4b8d8e0", "Simon Voss",
          "815da1ba-ff0d-59dc-8df6-aeff866957b0", "Simon Voß"),
]
EXPECTED_DOOMED = 27

# Doomed rows that own placements in the lock: (player rows, team rows).
OWNS_PLACEMENTS = {
    "1bfb569c-6400-5fbb-aca1-66b0cfb3abc3": (2, 0),
    "0f04687b-1e6c-597f-be61-6edb9e8e6bfa": (10, 5),
    "8b1e5ce1-b6be-58dd-90c3-02bafdb34ec6": (4, 0),
    "3b0979c2-55ac-56e0-9149-7507c0e2ca59": (1, 2),
    "cfa3e939-86f8-5927-bc67-1901278a4b52": (2, 1),
    "320a02aa-961a-57f9-a2e5-81fe6fec03e1": (5, 5),
    "2be1eb36-7b4c-582a-a402-8f313efa2d75": (1, 2),
    "42587bcd-8af7-5944-b21e-5c6aadf6a517": (1, 0),
    "620a8311-2a3a-5cdb-a5e3-c83a82f0bff1": (5, 5),
    "87e0d502-d749-53dd-997b-f266371d1474": (13, 14),
    "e6f5c3f9-b642-52a2-a6b4-9d8037fa5a83": (15, 15),
    "0dee73bb-caed-5f5c-9c20-5ea946939871": (39, 52),
    "02095322-bd6e-52a6-9f2d-6b5a7a527eae": (17, 3),
    "d45c75c4-4da0-5ee6-a4da-b1218a2201a7": (1, 0),
    "ede0da6c-0e27-576f-abe5-6a20a004343b": (9, 2),
    "f11252e7-1d3c-5e22-9819-32bdb69775de": (1, 0),
    "abd2fe08-1d5c-59bb-8c19-5ccd5a3be6e0": (1, 0),
    "0f49163a-1b6c-5734-b255-f1667058719f": (1, 0),
    "778326dc-8646-52dc-82c4-f0c274a2b447": (2, 0),
    "1462d41b-49bb-5174-9994-db350df37f4c": (1, 2),
    "6ed2ffbb-a3ce-5313-b045-2a382da11dd3": (1, 1),
    "8842db90-a28e-52d6-87e1-8466adcc548a": (1, 0),
}

# Spellings with no person row, resolved by an alias at the seed build:
# (spelling, survivor id, survivor name).
UNRESOLVED_SPELLINGS = [
    ("Uli Cazzaro", "6cf992d3-bd66-551e-9c08-82136518bd03", "Ulli Cazzaro"),
    ("Stephan Müller", "4f30afe3-3cc9-5781-8f31-cad3a87d30ae", "Stefan Müller"),
    ("Said Shaheen", "b0d9cc85-7974-55b2-918a-538fc48484e4", "Saiid Shaheen"),
    ("Leimar Romero", "70f84b64-5ac5-5082-91ac-8ad71f54b127", "Leimar Salas"),
    ("Taku Muira", "aefb17e0-f604-552c-8584-02e84b558563", "Taku Miura"),
    ("Timothy Kersey", "de16af96-461d-5ed8-8534-39b958304a41", "Tim Kersey"),
    ("Tom Bergamasco", "c0bc24e3-dd5f-5ad7-8570-77d685dd5638", "Thomas Bergamasco"),
]

# Pairs that stay apart: (first name, second name, status, reason).
RULED_APART = [
    ("Mike Mueller", "Michael Müller", "DIFFERENT",
     "Two people: Colorado in 1984 against Frankfurt from 2003."),
    ("J-F Bélanger", "JF Lemieux", "DIFFERENT",
     "Two people: different surnames, and neither matches the account they contest."),
    ("José Ángel", "José Goncalves", "CANNOT_TELL",
     "Cannot tell: both are from Caracas, and only the account name connects them."),
    ("Luis Enrique", "Luis Moreno Villegas", "CANNOT_TELL",
     "Cannot tell: the given name alone is too common to connect them."),
    ("Natasha Mercure", "Natacha Mercure", "CANNOT_TELL",
     "Cannot tell: the same scene and years that fit, with no shared partner, club or "
     "account tying them together."),
]

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


def merge_persons_truth() -> dict[str, dict[str, str]]:
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
            raise AssertionError(f"survivor {m.survivor_pid} ({m.canon}) missing (already merged?)")
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
    return by_pid


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


def repoint_display_names() -> None:
    lines = _lines(DISPLAY)
    header = next(csv.reader([lines[0]]))
    id_column = "effective_person_id" if "effective_person_id" in header else "person_id"
    out = [lines[0]]
    repointed = 0
    for line in lines[1:]:
        if not any(pid in line for pid in DOOMED_TO):
            out.append(line)
            continue
        r = _row(header, line)
        m = DOOMED_TO.get(r[id_column])
        if m is None:
            raise AssertionError(f"display names: doomed id in an unexpected column: {line[:120]}")
        r[id_column] = m.survivor_pid
        r["person_canon"] = m.canon
        out.append(_emit([r[h] for h in header]))
        repointed += 1
    PENDING[DISPLAY] = "\n".join(out)
    print(f"{DISPLAY.relative_to(ROOT)}: {repointed} row(s) repointed")


def repoint_and_add_aliases(by_pid: dict[str, dict[str, str]]) -> None:
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
    wanted = [(m.doomed_canon, m.survivor_pid, m.canon) for m in MERGES]
    for spelling, survivor_pid, canon in UNRESOLVED_SPELLINGS:
        row = by_pid.get(survivor_pid)
        if row is None or row["person_canon"] != canon:
            raise AssertionError(f"{spelling!r}: expected {canon!r} at {survivor_pid}")
        wanted.append((spelling, survivor_pid, canon))
    added = 0
    for spelling, survivor_pid, canon in wanted:
        key = normalize_name(spelling)
        if key == normalize_name(canon):
            continue
        owner = resolves.get(key)
        if owner == survivor_pid:
            continue
        if owner is not None:
            raise AssertionError(f"alias {spelling!r} already resolves to {owner}, not {survivor_pid}")
        out.append(_emit([spelling, survivor_pid, canon, "verified", NOTE]))
        resolves[key] = survivor_pid
        added += 1
    out.append("")
    PENDING[ALIASES] = "\n".join(out)
    print(f"{ALIASES.relative_to(ROOT)}: {repointed} alias row(s) repointed, {added} added")


def add_register_rows(by_pid: dict[str, dict[str, str]]) -> None:
    lines = _lines(REGISTER)
    header = next(csv.reader([lines[0]]))
    body = [line for line in lines if line]
    numbers = [int(_row(header, line)["pair_id"].split("-")[1]) for line in body[1:]]
    existing = {frozenset((normalize_name(_row(header, line)["alias_name"]),
                           normalize_name(_row(header, line)["canon_name"]))) for line in body[1:]}
    by_canon = {row["person_canon"]: pid for pid, row in by_pid.items()}
    next_number = max(numbers) + 1
    for first, second, status, reason in RULED_APART:
        key = frozenset((normalize_name(first), normalize_name(second)))
        if key in existing:
            raise AssertionError(f"register already rules {first!r} and {second!r} (already patched?)")
        for name in (first, second):
            if name not in by_canon:
                raise AssertionError(f"register: {name!r} has no lock row")
        row = {h: "" for h in header}
        row.update({
            "pair_id": f"R-{next_number}",
            "alias_name": first,
            "canon_name": second,
            "alias_pid": by_canon[first],
            "canon_pid": by_canon[second],
            "evidence_needed": "none" if status == "DIFFERENT" else "an outside source tying the two records to one player",
            "status": status,
            "notes": reason,
        })
        body.append(_emit([row[h] for h in header]))
        next_number += 1
    PENDING[REGISTER] = "\n".join(body) + "\n"
    print(f"{REGISTER.relative_to(ROOT)}: {len(RULED_APART)} ruled row(s) added")


def postconditions() -> None:
    for path, text in PENDING.items():
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
    by_pid = merge_persons_truth()
    remap_placements()
    repoint_display_names()
    repoint_and_add_aliases(by_pid)
    add_register_rows(by_pid)
    postconditions()
    for path, text in PENDING.items():
        path.write_text(text, encoding="utf-8")
    print(f"Merged {EXPECTED_DOOMED} duplicate rows and resolved {len(UNRESOLVED_SPELLINGS)} spellings")


if __name__ == "__main__":
    main()
