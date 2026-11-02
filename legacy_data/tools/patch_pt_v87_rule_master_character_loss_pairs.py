#!/usr/bin/env python3
"""
patch_pt_v87_rule_master_character_loss_pairs.py

Settle the 23 pairs the character-loss check raised between the identity lock and
the persons master: merge one duplicate row, correct five names, resolve the
provisional copies of ten players, and record every ruling.

A name match alone is never an identity decision. The maintainer ruled every pair
on evidence beyond the name.

One person, repaired here:
  Marilou Roy -> Marielou Roy, named Marie-Lou Roy. One AkiSphere 2011 page gives
    11th place to both Marie-Lou Roy and Marilou Roy with the same partner, and the
    2011 Worlds page has Marie-Lou Roy where the results have Marielou Roy.
  Erik Chang, named Erik Chan: five of the six event pages that mention him say
    Chan, and the Hackrifice events match the club of account 12487.
  Otto Remi, named Otto Remis: the page's "Remi?" is a damaged letter, and account
    75682 is in the Czech association.
  Tomasz Kociolkowski, named Tomasz Kociołkowski: the pages and account 64273 carry
    the letter, and his club is the Warsaw association he plays with.
  Marcus Lohman, named Marcus Lohmann: a Bremen event, and account 51349's club is
    in Bremen.
  Daniel Schlaepfer -> Daniel Schläpfer: accounts under both spellings share a town,
    and the results and the club are both in Zürich.
  Fred Noinaj -> Freddy Noinaj: a rare surname, with the event, account and club all
    in Chicago.
  Marco Doebeli -> Marco Döbeli: accounts under both spellings near Lausanne, and two
    event pages list the same organisers with one spelling each.
  Mili Rumpf -> Milli Rumpf: the 2003 Europeans page has both spellings at 10th in
    the same division.
  Slawek Brzezinski -> Sławek Brzeziński: their doubles partner Kamil Wysocki is in
    the same small club as the account.

One person, nothing to repair: Kaarel Tall and Kaarel Täll, Philipp Hanak, Thomas
Weiss. Each lock row has no placements and never reaches the database, so the
provisional row is already the only record. An alias would drop that row and leave
the player with no record at all.

Two people: Chris Ott and Chris Scott, John Webber and John Weber, Josh Han and Josh
Ohana. Cannot tell: Ben Elynn and Ben Lynn, Robert Nicholson under one name, Steve
Baker and Steve Barker, Josh Lackey and Joshua Lackey, Piotr Gryko and Piotrek Gryko,
Shane Kelly and Shane Kelley.

Operations:
  Persons_Truth_Final.csv       the survivor absorbs the doomed row; a renamed row
                                takes its new name and keeps the old one as seen and
                                presentable; the doomed row is deleted
  Placements_ByPerson.csv       the doomed id is replaced in team_person_key; a renamed
                                person's own rows take the new name; a doubles team's
                                display text, which is source text, stays
  Person_Display_Names_v1.csv   a row naming a doomed or renamed id follows it
  person_aliases.csv            rows naming a doomed or renamed id follow it; each
                                spelling gains a row unless one already resolves
  identity_review_queue.csv     the 23 rulings; the earlier cannot-tell on the two Roy
                                records becomes one person on the page that ties them

Each file is rewritten line by line: every other line is copied through byte for
byte. Every file is rewritten in memory and checked before any is written. A
second run stops on its pre-condition checks rather than compounding the edit;
checking out the five files is the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v87_rule_master_character_loss_pairs.py
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

ROY = "5b56ba95-212f-50c9-8679-c43966fffa44"
MARILOU = "501e621b-f61e-561d-bfad-0499c2831637"
CHAN = "1bedfc1b-885c-5426-a93f-6fe033fd5f3e"
REMIS = "03607deb-e269-5775-b8c3-36873c6aa3b6"
KOCIOLKOWSKI = "b073c3b7-95e2-5b0b-b66c-4f86649fd5d4"
LOHMANN = "5a19cfbc-f788-545f-815c-e861708686b8"
SCHLAPFER = "1631fe5a-47d0-50ef-a901-07d8a09ab51a"
NOINAJ = "e2be0e02-89b3-5d92-a51f-9bc013c0b29f"
DOBELI = "5fc5f6c4-2883-5af7-9870-04d8c9378031"
RUMPF = "6edf1a1d-2066-557a-b820-c1e15787f2fd"
BRZEZINSKI = "6d1c6944-8a56-59c2-a9dc-2af1f9b42f6c"

DOOMED_PID, DOOMED_CANON, DOOMED_TEAM_ROWS = MARILOU, "Marilou Roy", 1

# person id -> (name in the lock, corrected name)
RENAMES = {
    ROY: ("Marielou Roy", "Marie-Lou Roy"),
    CHAN: ("Erik Chang", "Erik Chan"),
    REMIS: ("Otto Remi", "Otto Remis"),
    KOCIOLKOWSKI: ("Tomasz Kociolkowski", "Tomasz Kociołkowski"),
    LOHMANN: ("Marcus Lohman", "Marcus Lohmann"),
}

# (spelling, person id, the person's name after this patch)
ALIAS_ROWS = [
    ("Marilou Roy", ROY, "Marie-Lou Roy"),
    ("Marielou Roy", ROY, "Marie-Lou Roy"),
    ("Marie-Lou Roy", ROY, "Marie-Lou Roy"),
    ("Erik Chang", CHAN, "Erik Chan"),
    ("Erik Chan", CHAN, "Erik Chan"),
    ("Otto Remi", REMIS, "Otto Remis"),
    ("Otto Remis", REMIS, "Otto Remis"),
    ("Tomasz Kociolkowski", KOCIOLKOWSKI, "Tomasz Kociołkowski"),
    ("Tomasz Kociołkowski", KOCIOLKOWSKI, "Tomasz Kociołkowski"),
    ("Marcus Lohman", LOHMANN, "Marcus Lohmann"),
    ("Marcus Lohmann", LOHMANN, "Marcus Lohmann"),
    ("Daniel Schlaepfer", SCHLAPFER, "Daniel Schläpfer"),
    ("Fred Noinaj", NOINAJ, "Freddy Noinaj"),
    ("Marco Doebeli", DOBELI, "Marco Döbeli"),
    ("Mili Rumpf", RUMPF, "Milli Rumpf"),
    ("Slawek Brzezinski", BRZEZINSKI, "Sławek Brzeziński"),
]

# (the other name, the name in the lock, status, reason)
RULINGS = [
    ("Marilou Roy", "Marie-Lou Roy", "SAME", "One person: one AkiSphere 2011 page gives 11th place to both spellings with the same partner."),
    ("Marielou Roy", "Marie-Lou Roy", "SAME", "One person: the 2011 Worlds page has Marie-Lou Roy where the results have Marielou Roy, and account 81670 carries that name."),
    ("Erik Chang", "Erik Chan", "SAME", "One person: five of six event pages say Chan, and the Hackrifice events match the club of account 12487."),
    ("Otto Remi", "Otto Remis", "SAME", "One person: the page's Remi? is a damaged letter, and account 75682 is in the Czech association."),
    ("Tomasz Kociolkowski", "Tomasz Kociołkowski", "SAME", "One person: the pages and account 64273 carry the letter, and his club is the Warsaw association."),
    ("Marcus Lohman", "Marcus Lohmann", "SAME", "One person: a Bremen event, and account 51349's club is in Bremen."),
    ("Daniel Schlaepfer", "Daniel Schläpfer", "SAME", "One person: accounts under both spellings share a town, and the results and the club are both in Zürich."),
    ("Fred Noinaj", "Freddy Noinaj", "SAME", "One person: a rare surname, with the event, account and club all in Chicago."),
    ("Marco Doebeli", "Marco Döbeli", "SAME", "One person: accounts under both spellings near Lausanne, and two event pages list the same organisers with one spelling each."),
    ("Mili Rumpf", "Milli Rumpf", "SAME", "One person: the 2003 Europeans page has both spellings at 10th in the same division."),
    ("Slawek Brzezinski", "Sławek Brzeziński", "SAME", "One person: their doubles partner Kamil Wysocki is in the same small club as the account."),
    ("Kaarel Täll", "Kaarel Tall", "SAME", "One person: the 2003 Worlds page has both spellings at 19th. The lock row has no placements, so the provisional row is the only record."),
    ("Philipp Hanak", "Philipp Hanak", "SAME", "One person: the 2003 Worlds page lists him for Austria, and account 37112 is in Vienna. The lock row has no placements, so the provisional row is the only record."),
    ("Thomas Weiss", "Thomas Weiss", "SAME", "One person: the 2003 Worlds page lists him for Austria, and account 38358 is in Vienna. The lock row has no placements, so the provisional row is the only record."),
    ("Chris Scott", "Chris Ott", "DIFFERENT", "Two people: California against New Zealand, with separate accounts."),
    ("John Webber", "John Weber", "DIFFERENT", "Two people: Indiana against Prague."),
    ("Josh Han", "Josh Ohana", "DIFFERENT", "Two people: Anaheim against Atlanta, with different clubs."),
    ("Ben Lynn", "Ben Elynn", "CANNOT_TELL", "Cannot tell: a Sydney result and a Stanford club member; nothing connects them and nothing rules it out."),
    ("Robert Nicholson", "Robert Nicholson", "CANNOT_TELL", "Cannot tell: an empty lock row, a roster entry and no account; only the name connects them."),
    ("Steve Barker", "Steve Baker", "CANNOT_TELL", "Cannot tell: a 1995 Worlds place and a Nottingham account; both surnames are real and nothing connects them."),
    ("Joshua Lackey", "Josh Lackey", "CANNOT_TELL", "Cannot tell: a rare surname and nearby Canadian cities are suggestive, with no account, event or partner link."),
    ("Piotrek Gryko", "Piotr Gryko", "CANNOT_TELL", "Cannot tell: a rare surname and a short form in one country are circumstantial, and the cities differ."),
    ("Shane Kelley", "Shane Kelly", "CANNOT_TELL", "Cannot tell: a Harrisburg net result near a net club, against a Delaware account, is too weak to establish identity."),
]
EXPECTED_RULINGS = 23

# The earlier ruling this patch replaces.
EARLIER_ROY_PAIR = "R-85"
EARLIER_ROY_NOTE = "One person: one AkiSphere 2011 page gives 11th place to both spellings with the same partner. Merged into Marie-Lou Roy."


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


def _keep_old_name(row: dict[str, str], old: str, new: str) -> None:
    names = set(_pipe(row["player_names_seen"])) | {old}
    presentable = set(_pipe(row["aliases_presentable"])) | {old}
    presentable.discard(new)
    row["player_names_seen"] = DELIM.join(sorted(names))
    row["aliases_presentable"] = DELIM.join(sorted(presentable))


def merge_and_rename_persons_truth() -> dict[str, dict[str, str]]:
    lines = _lines(PT)
    header = next(csv.reader([lines[0]]))
    by_pid = {}
    for line in lines[1:]:
        if line:
            r = _row(header, line)
            by_pid[r["effective_person_id"]] = r
    for pid, (old, _new) in RENAMES.items():
        if pid not in by_pid or by_pid[pid]["person_canon"] != old:
            raise AssertionError(f"{pid}: expected {old!r} (already patched?)")
    doomed = by_pid.get(DOOMED_PID)
    if doomed is None or doomed["person_canon"] != DOOMED_CANON:
        raise AssertionError(f"doomed {DOOMED_PID} ({DOOMED_CANON}) missing (already merged?)")
    if doomed["legacyid"].strip() or doomed["exclusion_reason"].strip():
        raise AssertionError(f"doomed {DOOMED_CANON} carries an account link or an exclusion")
    survivor = by_pid[ROY]
    ids = set(_pipe(survivor["player_ids_seen"])) | (set(_pipe(doomed["player_ids_seen"])) - {DOOMED_PID})
    survivor["player_ids_seen"] = DELIM.join(sorted(ids))
    _keep_old_name(survivor, DOOMED_CANON, RENAMES[ROY][1])
    for pid, (old, new) in RENAMES.items():
        r = by_pid[pid]
        r["person_canon"] = new
        r["person_canon_clean"] = new
        r["last_token"] = new.split()[-1].lower()
        _keep_old_name(r, old, new)
    out, dropped = [lines[0]], 0
    for line in lines[1:]:
        if not line:
            out.append(line)
            continue
        pid = line.split(",", 1)[0]
        if pid == DOOMED_PID:
            dropped += 1
            continue
        if pid in RENAMES:
            out.append(_emit([by_pid[pid][h] for h in header]))
            continue
        out.append(line)
    if dropped != 1:
        raise AssertionError(f"persons truth: deleted {dropped} rows, expected 1")
    PENDING[PT] = "\n".join(out)
    print(f"{PT.relative_to(ROOT)}: {len(RENAMES)} names corrected, {dropped} row deleted")
    return by_pid


def remap_placements() -> None:
    lines = _lines(PBP)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    team_moved = renamed = 0
    for line in lines[1:]:
        if DOOMED_PID not in line and not any(pid in line for pid in RENAMES):
            out.append(line)
            continue
        r = _row(header, line)
        if r["person_id"] == DOOMED_PID:
            raise AssertionError(f"placements: {DOOMED_CANON} owns a player row: {line[:120]}")
        if DOOMED_PID in r["team_person_key"]:
            r["team_person_key"] = r["team_person_key"].replace(DOOMED_PID, ROY)
            team_moved += 1
        if r["person_id"] in RENAMES:
            old, new = RENAMES[r["person_id"]]
            if r["person_canon"] != old:
                raise AssertionError(f"placements: expected {old!r}: {line[:120]}")
            r["person_canon"] = new
            r["norm"] = new.lower()
            renamed += 1
        out.append(_emit([r[h] for h in header]))
    if team_moved != DOOMED_TEAM_ROWS:
        raise AssertionError(f"placements: moved {team_moved} team rows, expected {DOOMED_TEAM_ROWS}")
    PENDING[PBP] = "\n".join(out)
    print(f"{PBP.relative_to(ROOT)}: {team_moved} team row moved, {renamed} player row(s) renamed")


def follow_display_names() -> None:
    lines = _lines(DISPLAY)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    changed = 0
    for line in lines[1:]:
        if DOOMED_PID not in line and not any(pid in line for pid in RENAMES):
            out.append(line)
            continue
        r = _row(header, line)
        pid = ROY if r["effective_person_id"] == DOOMED_PID else r["effective_person_id"]
        if pid not in RENAMES:
            raise AssertionError(f"display names: id in an unexpected column: {line[:120]}")
        r["effective_person_id"] = pid
        r["person_canon"] = RENAMES[pid][1]
        out.append(_emit([r[h] for h in header]))
        changed += 1
    PENDING[DISPLAY] = "\n".join(out)
    print(f"{DISPLAY.relative_to(ROOT)}: {changed} row(s) followed")


def follow_and_add_aliases(by_pid: dict[str, dict[str, str]]) -> None:
    lines = _lines(ALIASES)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    resolves: dict[str, str] = {}
    followed = 0
    for line in lines[1:]:
        if not line:
            continue
        r = _row(header, line)
        pid = ROY if r["person_id"] == DOOMED_PID else r["person_id"]
        if pid in RENAMES:
            r["person_id"], r["person_canon"] = pid, RENAMES[pid][1]
            line = _emit([r[h] for h in header])
            followed += 1
        resolves.setdefault(normalize_name(r["alias"]), pid)
        out.append(line)
    added = 0
    for spelling, pid, canon in ALIAS_ROWS:
        if by_pid[pid]["person_canon"] != canon:
            raise AssertionError(f"{spelling!r}: expected {canon!r} at {pid}")
        key = normalize_name(spelling)
        owner = resolves.get(key)
        if owner == pid:
            continue
        if owner is not None:
            raise AssertionError(f"alias {spelling!r} already resolves to {owner}, not {pid}")
        out.append(_emit([spelling, pid, canon, "verified", NOTE]))
        resolves[key] = pid
        added += 1
    out.append("")
    PENDING[ALIASES] = "\n".join(out)
    print(f"{ALIASES.relative_to(ROOT)}: {followed} alias row(s) followed, {added} added")


def add_register_rows(by_pid: dict[str, dict[str, str]]) -> None:
    lines = _lines(REGISTER)
    header = next(csv.reader([lines[0]]))
    body = [line for line in lines if line]
    for i, line in enumerate(body[1:], start=1):
        r = _row(header, line)
        if r["pair_id"] == EARLIER_ROY_PAIR:
            if r["status"] != "CANNOT_TELL" or r["alias_pid"] != ROY or r["canon_pid"] != DOOMED_PID:
                raise AssertionError(f"{EARLIER_ROY_PAIR}: not the earlier Roy ruling (already patched?)")
            r["status"] = "SAME"
            r["evidence_needed"] = "none"
            r["notes"] = EARLIER_ROY_NOTE
            body[i] = _emit([r[h] for h in header])
            break
    else:
        raise AssertionError(f"{EARLIER_ROY_PAIR} missing from the register")
    numbers = [int(_row(header, line)["pair_id"].split("-")[1]) for line in body[1:]]
    existing = {frozenset((normalize_name(_row(header, line)["alias_name"]),
                           normalize_name(_row(header, line)["canon_name"]))) for line in body[1:]}
    by_canon = {row["person_canon"]: pid for pid, row in by_pid.items()}
    next_number = max(numbers) + 1
    for other, name, status, reason in RULINGS:
        key = frozenset((normalize_name(other), normalize_name(name)))
        if key in existing:
            raise AssertionError(f"register already rules {other!r} and {name!r} (already patched?)")
        row = {h: "" for h in header}
        row.update({
            "pair_id": f"R-{next_number}",
            "alias_name": other,
            "canon_name": name,
            "canon_pid": by_canon.get(name, ""),
            "evidence_needed": "an outside source tying the two records to one player" if status == "CANNOT_TELL" else "none",
            "status": status,
            "notes": reason,
        })
        body.append(_emit([row[h] for h in header]))
        existing.add(key)
        next_number += 1
    PENDING[REGISTER] = "\n".join(body) + "\n"
    print(f"{REGISTER.relative_to(ROOT)}: {len(RULINGS)} ruled row(s) added, {EARLIER_ROY_PAIR} updated")


def postconditions() -> None:
    for path, text in PENDING.items():
        if path != REGISTER and DOOMED_PID in text:
            raise AssertionError(f"{path.name} would still name doomed id {DOOMED_PID}")


def main() -> None:
    for p in (PT, PBP, DISPLAY, ALIASES, REGISTER):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    if len(RULINGS) != EXPECTED_RULINGS:
        raise AssertionError(f"{len(RULINGS)} rulings listed, expected {EXPECTED_RULINGS}")
    by_pid = merge_and_rename_persons_truth()
    remap_placements()
    follow_display_names()
    follow_and_add_aliases(by_pid)
    add_register_rows(by_pid)
    postconditions()
    for path, text in PENDING.items():
        path.write_text(text, encoding="utf-8")
    print(f"Merged 1 duplicate row, corrected {len(RENAMES)} names, recorded {len(RULINGS)} rulings")


if __name__ == "__main__":
    main()
