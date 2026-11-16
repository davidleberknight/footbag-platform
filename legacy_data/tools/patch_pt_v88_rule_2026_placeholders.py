#!/usr/bin/env python3
"""
patch_pt_v88_rule_2026_placeholders.py

Apply the rulings on the placeholder people at the 2026 Worlds and Europeans,
merge two duplicate rows, and remove four empty person rows the display-name map
kept alive.

A name match alone is never an identity decision. The maintainer ruled each on
evidence beyond the name.

One person, placeholder spelling resolved to the real record:
  Patrick Cerny -> Patrik Cerny: at the 2026 Worlds under both spellings in
    different contests; he also won Routines at the 2025 Europeans.
  Horiaki Wakana -> Hiroaki Wakana: both at the 2026 Worlds in different contests;
    two letters swapped.
  Mattias Schmidt -> Matthias Lino Schmidt: both at the 2026 Worlds in different
    contests.
  Chris Britting -> Christian Britting: both at the 2026 Worlds in different
    contests; the short form.
  Damian Gilnicki -> Damian Gielnicki: one letter off, a Polish player active
    through 2025 with no 2026 Worlds results under the right spelling.
  Frenzel Eduardo -> Eduardo Frenzel Martinez: the same net divisions, active in
    European net in 2026; the name order reversed.

One person, duplicate row merged:
  Frenzel Eduardo Martinez (9ad97b4a) -> Eduardo Frenzel Martinez (5ac74658): two
    net doubles results in Germany under the reversed name order. The row owns no
    placements; its results attach by name once the spelling is the survivor's.
  Alex Faber (16b2083f) -> Alexander Faber (bd9edb36): the 2002 Cinco de Mayo page
    has each in one Open contest behind Jon Schneider, only one Faber account fits,
    and the two records run together from 2000 to 2003. Alex stays an alias.

Cannot tell: TJ Bouterwick and T.J. Boutorwick; Kana Kanako against Kana Kubota
and against Kanako Uhara. Fifteen further placeholders are new players with no
earlier record, recorded so the register says each was looked at.

Empty rows: the export writes a person row for every entry in the display-name
map, so a map entry still naming an id the lock merged away keeps an empty person
alive. Four entries follow the lock record that already holds the spelling: Jose
Bolivar Izzo (José Bolívar), Jonas Thull (Jonas Thoell), Evanne Lemarche (Evanne
LaMarche) and Petr Fucik (Petr Fuèík, as the lock names him). The Jonas Thull alias
row takes the lock name too, because the resolver binds an alias by that name.

Operations:
  Persons_Truth_Final.csv       the survivor absorbs the doomed row's player ids and
                                spellings; the doomed row is deleted
  Placements_ByPerson.csv       the doomed person's own rows move to the survivor
  Person_Display_Names_v1.csv   the four stale entries follow the lock
  person_aliases.csv            rows naming a doomed id follow the survivor; the
                                Jonas Thull row takes the lock name; each placeholder
                                and doomed spelling gains a row unless one already
                                resolves to its person
  identity_review_queue.csv     the rulings

Each file is rewritten line by line: every other line is copied through byte for
byte. Every file is rewritten in memory and checked before any is written. A
second run stops on its pre-condition checks rather than compounding the edit;
checking out the five files is the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v88_rule_2026_placeholders.py
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

CERNY = "700e0ec0-94b9-5de3-b9a9-8d40a3645de3"
WAKANA = "a0084aad-23c8-5489-bba8-d69a7f7ad10b"
SCHMIDT = "f52e0fe8-4eff-5532-9af4-14124f1e92ee"
BRITTING = "e3d94c0b-8963-5e74-bc7c-5efb703a22b4"
GIELNICKI = "ac1268dc-a961-568f-860e-63e9ea815c01"
FRENZEL = "5ac74658-81ad-5c49-ba70-5834dfb04168"
FABER = "bd9edb36-ddd6-5fa8-b46f-aad4e708716d"
BOUTORWICK = "4120a537-80b0-5a89-a0b2-b24a4cf4550a"
BOLIVAR = "ffdcaf7f-8188-5fa1-be12-6dbfdb4b9804"
THOELL = "f11d8cfd-276b-57fd-ae34-1f9345931683"
LAMARCHE = "299071d7-2781-514f-93b1-6b7a7059ab8a"
FUCIK = "384c1fd0-bc17-53d8-9680-55b03876dddf"


@dataclass
class Merge:
    survivor_pid: str
    canon: str
    doomed_pid: str
    doomed_canon: str
    player_rows: int


MERGES: list[Merge] = [
    Merge(FRENZEL, "Eduardo Frenzel Martinez", "9ad97b4a-efc0-5718-a789-ce05bb9a732e", "Frenzel Eduardo Martinez", 0),
    Merge(FABER, "Alexander Faber", "16b2083f-d41a-5944-8669-d41494e21159", "Alex Faber", 7),
]
DOOMED_TO = {m.doomed_pid: m for m in MERGES}

# Placeholder spelling -> (person id, the person's name in the lock)
PLACEHOLDERS = {
    "Patrick Cerny": (CERNY, "Patrik Cerny"),
    "Horiaki Wakana": (WAKANA, "Hiroaki Wakana"),
    "Mattias Schmidt": (SCHMIDT, "Matthias Lino Schmidt"),
    "Chris Britting": (BRITTING, "Christian Britting"),
    "Damian Gilnicki": (GIELNICKI, "Damian Gielnicki"),
    "Frenzel Eduardo": (FRENZEL, "Eduardo Frenzel Martinez"),
}

# Stale display-map id -> (map spelling, lock person id, lock name)
DISPLAY_FOLLOWS = {
    "8a474859-f03c-5fe0-b01d-8a82bd060685": ("Jose Bolivar Izzo", BOLIVAR, "José Bolívar"),
    "3c2d2065-526b-5efa-89c6-291a1c698937": ("Jonas Thull", THOELL, "Jonas Thoell"),
    "b0e97088-521c-5509-a1d1-126d38af3fa4": ("Evanne Lemarche", LAMARCHE, "Evanne LaMarche"),
    "d775b0a0-5eed-57cd-921d-1d046d87fa50": ("Petr Fucik", FUCIK, "Petr Fuèík"),
}
EXPECTED_DISPLAY_ROWS = 5  # Petr Fucik has an all-caps second row

# Alias rows whose person_canon must take the lock name: alias -> (person id, lock name)
ALIAS_CANON_FIXES = {
    "Jonas Thull": (THOELL, "Jonas Thoell"),
}

NEW_PLAYER = "New player: no earlier record of this player, nothing to merge."
CANNOT_TELL_KANA = "Cannot tell: could be Kana Kubota, Kanako Uhara or someone else."

# (the other name, the name in the lock or blank, canon pid or blank, alias pid or blank, status, reason)
RULINGS = [
    ("Patrick Cerny", "Patrik Cerny", CERNY, "", "SAME",
     "One person: at the 2026 Worlds under both spellings in different contests, and he also won Routines at the 2025 Europeans."),
    ("Horiaki Wakana", "Hiroaki Wakana", WAKANA, "", "SAME",
     "One person: both spellings at the 2026 Worlds in different contests; two letters swapped."),
    ("Mattias Schmidt", "Matthias Lino Schmidt", SCHMIDT, "", "SAME",
     "One person: both at the 2026 Worlds in different contests."),
    ("Chris Britting", "Christian Britting", BRITTING, "", "SAME",
     "One person: both at the 2026 Worlds in different contests; Chris is the short form."),
    ("Damian Gilnicki", "Damian Gielnicki", GIELNICKI, "", "SAME",
     "One person: one letter off, a Polish player active through 2025 with no 2026 Worlds results under the right spelling."),
    ("Frenzel Eduardo", "Eduardo Frenzel Martinez", FRENZEL, "", "SAME",
     "One person: the same net divisions and active in European net in 2026; the name order reversed."),
    ("Frenzel Eduardo Martinez", "Eduardo Frenzel Martinez", FRENZEL, "9ad97b4a-efc0-5718-a789-ce05bb9a732e", "SAME",
     "One person: two net doubles results in Germany under the reversed name order. Merged into Eduardo Frenzel Martinez."),
    ("Alex Faber", "Alexander Faber", FABER, "16b2083f-d41a-5944-8669-d41494e21159", "SAME",
     "One person: the 2002 Cinco de Mayo page has each in one Open contest behind Jon Schneider, only one Faber account fits, and the two records run together from 2000 to 2003. Merged into Alexander Faber; Alex stays an alias."),
    ("TJ Bouterwick", "T.J. Boutorwick", BOUTORWICK, "", "CANNOT_TELL",
     "Cannot tell: a rare surname and a similar spelling, with nothing tying him to this event."),
    ("Kana Kanako", "Kana Kubota", "", "", "CANNOT_TELL", CANNOT_TELL_KANA),
    ("Kana Kanako", "Kanako Uhara", "", "", "CANNOT_TELL", CANNOT_TELL_KANA),
] + [
    (name, "", "", "", "DIFFERENT", NEW_PLAYER)
    for name in (
        "Chi Wai Lam", "Daiki Hirata", "Fumina Takahashi", "Ho Kan Lau", "Kana Kubota",
        "Kanako Uhara", "Leathon Femmel", "Masanari Shibuya", "Naoto Matsuda", "Sze Ming Hon",
        "Takeaki Toyozato", "True Cha", "Yiu Keung Ng", "Atsushi Tamura", "Hiroshi Yoshikawa",
    )
]
EXPECTED_RULINGS = 26


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
    for spelling, (pid, canon) in PLACEHOLDERS.items():
        if pid not in by_pid or by_pid[pid]["person_canon"] != canon:
            raise AssertionError(f"{spelling!r}: expected {canon!r} at {pid}")
    for stale, (spelling, pid, canon) in DISPLAY_FOLLOWS.items():
        if stale in by_pid:
            raise AssertionError(f"{spelling!r}: {stale} is in the lock, expected it absent")
        if pid not in by_pid or by_pid[pid]["person_canon"] != canon:
            raise AssertionError(f"{spelling!r}: expected {canon!r} at {pid}")
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
    if dropped != len(MERGES):
        raise AssertionError(f"persons truth: deleted {dropped} rows, expected {len(MERGES)}")
    PENDING[PT] = "\n".join(out)
    print(f"{PT.relative_to(ROOT)}: {len(survivors)} survivors updated, {dropped} rows deleted")
    return by_pid


def remap_placements() -> None:
    lines = _lines(PBP)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    moved = {pid: 0 for pid in DOOMED_TO}
    for line in lines[1:]:
        hit = [pid for pid in DOOMED_TO if pid in line]
        if not hit:
            out.append(line)
            continue
        r = _row(header, line)
        for pid in hit:
            m = DOOMED_TO[pid]
            if r["person_id"] != pid:
                raise AssertionError(f"placements: {m.doomed_canon} in an unexpected column: {line[:120]}")
            r["person_id"] = m.survivor_pid
            r["person_canon"] = m.canon
            r["norm"] = m.canon.lower()
            moved[pid] += 1
        out.append(_emit([r[h] for h in header]))
    for m in MERGES:
        if moved[m.doomed_pid] != m.player_rows:
            raise AssertionError(f"placements for {m.doomed_canon}: moved {moved[m.doomed_pid]}, expected {m.player_rows}")
    PENDING[PBP] = "\n".join(out)
    print(f"{PBP.relative_to(ROOT)}: {sum(moved.values())} player row(s) moved")


def follow_display_names() -> None:
    lines = _lines(DISPLAY)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    changed = 0
    for line in lines[1:]:
        if not any(stale in line for stale in DISPLAY_FOLLOWS) and not any(pid in line for pid in DOOMED_TO):
            out.append(line)
            continue
        r = _row(header, line)
        if r["effective_person_id"] in DOOMED_TO:
            raise AssertionError(f"display names: names a doomed id: {line[:120]}")
        follow = DISPLAY_FOLLOWS.get(r["effective_person_id"])
        if follow is None:
            raise AssertionError(f"display names: stale id in an unexpected column: {line[:120]}")
        spelling, pid, canon = follow
        r["effective_person_id"] = pid
        r["person_canon"] = canon
        r["notes"] = f"{spelling} is one person with {canon} in the identity lock"
        out.append(_emit([r[h] for h in header]))
        changed += 1
    if changed != EXPECTED_DISPLAY_ROWS:
        raise AssertionError(f"display names: followed {changed} rows, expected {EXPECTED_DISPLAY_ROWS}")
    PENDING[DISPLAY] = "\n".join(out)
    print(f"{DISPLAY.relative_to(ROOT)}: {changed} row(s) follow the lock")


def follow_and_add_aliases() -> None:
    lines = _lines(ALIASES)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    resolves: dict[str, str] = {}
    followed = fixed = 0
    for line in lines[1:]:
        if not line:
            continue
        r = _row(header, line)
        if r["person_id"] in DOOMED_TO:
            m = DOOMED_TO[r["person_id"]]
            r["person_id"], r["person_canon"] = m.survivor_pid, m.canon
            line = _emit([r[h] for h in header])
            followed += 1
        elif r["alias"] in ALIAS_CANON_FIXES and r["person_id"] == ALIAS_CANON_FIXES[r["alias"]][0]:
            r["person_canon"] = ALIAS_CANON_FIXES[r["alias"]][1]
            line = _emit([r[h] for h in header])
            fixed += 1
        resolves.setdefault(normalize_name(r["alias"]), r["person_id"])
        out.append(line)
    if fixed != len(ALIAS_CANON_FIXES):
        raise AssertionError(f"aliases: fixed {fixed} lock names, expected {len(ALIAS_CANON_FIXES)} (already patched?)")
    wanted = [(spelling, pid, canon) for spelling, (pid, canon) in PLACEHOLDERS.items()]
    wanted += [(m.doomed_canon, m.survivor_pid, m.canon) for m in MERGES]
    added = 0
    for spelling, pid, canon in wanted:
        key = normalize_name(spelling)
        if key == normalize_name(canon):
            continue
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
    print(f"{ALIASES.relative_to(ROOT)}: {followed} alias row(s) followed, {fixed} lock name fixed, {added} added")


def add_register_rows() -> None:
    lines = _lines(REGISTER)
    header = next(csv.reader([lines[0]]))
    body = [line for line in lines if line]
    numbers = [int(_row(header, line)["pair_id"].split("-")[1]) for line in body[1:]]
    existing = {frozenset((normalize_name(_row(header, line)["alias_name"]),
                           normalize_name(_row(header, line)["canon_name"]))) for line in body[1:]}
    next_number = max(numbers) + 1
    for other, name, canon_pid, alias_pid, status, reason in RULINGS:
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
            "evidence_needed": "an outside source tying the two records to one player" if status == "CANNOT_TELL" else "none",
            "status": status,
            "notes": reason,
        })
        body.append(_emit([row[h] for h in header]))
        existing.add(key)
        next_number += 1
    PENDING[REGISTER] = "\n".join(body) + "\n"
    print(f"{REGISTER.relative_to(ROOT)}: {len(RULINGS)} ruled row(s) added")


def postconditions() -> None:
    for path, text in PENDING.items():
        if path == REGISTER:
            continue
        for pid in DOOMED_TO:
            if pid in text:
                raise AssertionError(f"{path.name} would still name doomed id {pid}")
        if path == DISPLAY:
            for stale in DISPLAY_FOLLOWS:
                if stale in text:
                    raise AssertionError(f"{path.name} would still name stale id {stale}")


def main() -> None:
    for p in (PT, PBP, DISPLAY, ALIASES, REGISTER):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    if len(RULINGS) != EXPECTED_RULINGS:
        raise AssertionError(f"{len(RULINGS)} rulings listed, expected {EXPECTED_RULINGS}")
    merge_persons_truth()
    remap_placements()
    follow_display_names()
    follow_and_add_aliases()
    add_register_rows()
    postconditions()
    for path, text in PENDING.items():
        path.write_text(text, encoding="utf-8")
    print(f"Merged {len(MERGES)} duplicate rows, followed {len(DISPLAY_FOLLOWS)} stale display entries, "
          f"recorded {len(RULINGS)} rulings")


if __name__ == "__main__":
    main()
