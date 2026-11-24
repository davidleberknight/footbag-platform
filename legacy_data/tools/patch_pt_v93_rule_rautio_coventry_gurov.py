#!/usr/bin/env python3
"""
patch_pt_v93_rule_rautio_coventry_gurov.py

Apply three identity rulings the maintainer made on the mirror pages' evidence.

Henry and Heikki Rautio are two people. The 2001 Keuruu Footbag Jam page ranks
both names in the same contest at different places, twice, and every member
record found is Henry's. Heikki keeps his record and his two Keuruu places;
Henry gets back his former record and player id, with his other two Keuruu
places and his 2001 Finnish Championships place. The alias joining them goes.

Damien Coventry and Damian Budzik are two people. Every page naming Coventry
places him in New Zealand, 1997 to 2001; Budzik is from Wroclaw, Poland, from
2001 on, with a separate member account. Budzik keeps his record; Coventry's
three places move to Coventry's own record. The alias joining them goes.

Kaluga Gurov and Kirill Kaluga Gurov are one person: Kirill Gurov, nicknamed
after his home city of Kaluga, named so on all three 2004 Russian stage pages.
The survivor is Kirill Kaluga Gurov. The other record's place moves to him, the
unresolved Stage 1 entry "Kirill Gurov" links to him, and both spellings become
his aliases.

Operations:
  Persons_Truth_Final.csv       Henry's row is re-added after Heikki's; Heikki
                                loses the Henry alias; Budzik loses the Coventry
                                spelling; the Gurov survivor absorbs the other
                                record, which is deleted
  Placements_ByPerson.csv       the named places move to their person
  person_aliases.csv            the two contradicted alias rows are removed; the
                                two Gurov spellings are added
  identity_review_queue.csv     the four rulings

Each file is rewritten line by line: every other line is copied through byte for
byte. Every file is rewritten in memory and checked before any is written. A
second run stops on its pre-condition checks rather than compounding the edit;
checking out the four files is the rollback.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v93_rule_rautio_coventry_gurov.py
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
ALIASES = ROOT / "overrides" / "person_aliases.csv"
REGISTER = ROOT / "overrides" / "identity_review_queue.csv"
DELIM = " | "
PENDING: dict[Path, str] = {}

HEIKKI = "98cee1b4-8771-5d83-b62c-24d9dcba0450"
HENRY = "04ec794c-27b3-5d3f-a9c0-4058fbaa133d"
HENRY_PLAYER_ID = "507cac49-7144-5ab4-b0ef-07938254c278"
BUDZIK = "a3781ac2-c529-5316-b22b-2bdcfa67bb67"
COVENTRY = "3d493481-3f0f-5731-9824-c55940a16045"
GUROV = "a6352d66-fad2-591b-bd83-06d4f57e981a"
GUROV_DOOMED = "8748b1e3-776e-5296-bcda-91205be6a4eb"
GUROV_DOOMED_PLAYER_ID = "fb604041-afbc-5d9e-a3bd-0dd94825a269"

# Henry's record as the identity lock held it before it was folded into Heikki's.
HENRY_ROW = {
    "effective_person_id": HENRY, "person_canon": "Henry Rautio",
    "player_ids_seen": HENRY_PLAYER_ID, "player_names_seen": "Henry Rautio",
    "aliases": "", "alias_statuses": "", "notes": "", "source": "overrides+data",
    "person_canon_clean": "Henry Rautio", "person_canon_clean_reason": "",
    "aliases_presentable": "", "exclusion_reason": "", "last_token": "rautio",
    "norm_key": "", "legacyid": "",
}

# (event_id, division_canon, place, current person_id, current norm) -> new person.
# A blank current person_id is an unresolved entry.
MOVES: dict[tuple[str, str, str, str, str], tuple[str, str]] = {
    ("992517335", "Shred:30", "10", HEIKKI, "henry rautio"): (HENRY, "Henry Rautio"),
    ("992517335", "Sick 5", "12", HEIKKI, "henry rautio"): (HENRY, "Henry Rautio"),
    ("1001076315", "Intermediate Freestyle", "8", HEIKKI, "heikki rautio"): (HENRY, "Henry Rautio"),
    ("941418343", "Open Singles Freestyle", "32", COVENTRY, "damien coventry"): (COVENTRY, "Damien Coventry"),
    ("973573676", "Solo Consec's", "1", BUDZIK, "damian budzik"): (COVENTRY, "Damien Coventry"),
    ("996293200", "Singles Freestyle", "4", BUDZIK, "damian budzik"): (COVENTRY, "Damien Coventry"),
    ("1081766954", "Open Singles Freestyle", "8", GUROV_DOOMED, "kaluga gurov"): (GUROV, "Kirill Kaluga Gurov"),
    ("1076876907", "Open Singles Freestyle", "5", "", "kirill gurov"): (GUROV, "Kirill Kaluga Gurov"),
}

REMOVED_ALIASES = {("Henry Rautio", HEIKKI), ("Damien Coventry", BUDZIK)}
GUROV_NOTE = "another name of the same player; ruled one person on evidence beyond the name"
ADDED_ALIASES = [("Kaluga Gurov", GUROV, "Kirill Kaluga Gurov"),
                 ("Kirill Gurov", GUROV, "Kirill Kaluga Gurov")]

# (alias_name, canon_name, alias_pid, canon_pid, status, notes)
RULINGS = [
    ("Henry Rautio", "Heikki Rautio", HENRY, HEIKKI, "DIFFERENT",
     "Two people. The 2001 Keuruu Footbag Jam page ranks both names in the same contest at "
     "different places, in Shred:30 and in Sick 5, and every member record found is Henry's. "
     "Split: Henry has his own record again."),
    ("Damien Coventry", "Damian Budzik", COVENTRY, BUDZIK, "DIFFERENT",
     "Two people. Every page naming Coventry places him in New Zealand, 1997 to 2001; Budzik is "
     "from Wroclaw, Poland, from 2001 on, with a separate member account. Split: Coventry's "
     "three places are on his own record."),
    ("Kaluga Gurov", "Kirill Kaluga Gurov", GUROV_DOOMED, GUROV, "SAME",
     "One person: the three 2004 Russian stage pages name Kirill Gurov, nicknamed after his home "
     "city of Kaluga, and no other Gurov appears. Merged into Kirill Kaluga Gurov."),
    ("Kirill Gurov", "Kirill Kaluga Gurov", "", GUROV, "SAME",
     "One person: the 2004 Russian Stage 1 page writes Kirill Gurov (Kaluga). The entry links "
     "to Kirill Kaluga Gurov."),
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


def _expect(row: dict[str, str] | None, field: str, value: str, who: str) -> None:
    if row is None:
        raise AssertionError(f"{who}: row missing (already patched?)")
    if row[field] != value:
        raise AssertionError(f"{who}: expected {field}={value!r}, got {row[field]!r} (already patched?)")


def rule_persons_truth() -> None:
    lines = _lines(PT)
    header = next(csv.reader([lines[0]]))
    by_pid = {}
    for line in lines[1:]:
        if line:
            r = _row(header, line)
            by_pid[r["effective_person_id"]] = r
    if HENRY in by_pid:
        raise AssertionError("Henry Rautio's record already exists (already patched?)")
    _expect(by_pid.get(HEIKKI), "aliases", "Henry Rautio", "Heikki Rautio")
    budzik = by_pid.get(BUDZIK)
    if budzik is None or "Damien Coventry" not in _pipe(budzik["aliases_presentable"]):
        raise AssertionError("Damian Budzik: expected the spelling Damien Coventry (already patched?)")
    _expect(by_pid.get(COVENTRY), "person_canon", "Damien Coventry", "Damien Coventry")
    _expect(by_pid.get(GUROV), "person_canon", "Kirill Kaluga Gurov", "Kirill Kaluga Gurov")
    doomed = by_pid.get(GUROV_DOOMED)
    _expect(doomed, "person_canon", "Kaluga Gurov", "Kaluga Gurov")
    for who, r in (("Kaluga Gurov", doomed), ("Kirill Kaluga Gurov", by_pid[GUROV])):
        if r["legacyid"].strip() or r["exclusion_reason"].strip():
            raise AssertionError(f"{who} carries a legacy account link or an exclusion")

    by_pid[HEIKKI]["aliases"] = ""
    budzik["aliases_presentable"] = DELIM.join(
        p for p in _pipe(budzik["aliases_presentable"]) if p != "Damien Coventry")
    g = by_pid[GUROV]
    g["player_ids_seen"] = DELIM.join(sorted(set(_pipe(g["player_ids_seen"])) | {GUROV_DOOMED_PLAYER_ID}))
    g["player_names_seen"] = DELIM.join(sorted(set(_pipe(g["player_names_seen"])) | {"Kaluga Gurov"}))
    g["aliases_presentable"] = DELIM.join(
        sorted(set(_pipe(g["aliases_presentable"])) | {"Kaluga Gurov", "Kirill Gurov"}))

    out, dropped = [lines[0]], 0
    for line in lines[1:]:
        pid = line.split(",", 1)[0] if line else ""
        if pid == GUROV_DOOMED:
            dropped += 1
            continue
        if pid in (HEIKKI, BUDZIK, GUROV):
            out.append(_emit([by_pid[pid][h] for h in header]))
            if pid == HEIKKI:
                out.append(_emit([HENRY_ROW[h] for h in header]))
            continue
        out.append(line)
    if dropped != 1:
        raise AssertionError(f"persons truth: deleted {dropped} rows, expected 1")
    PENDING[PT] = "\n".join(out)
    print(f"{PT.relative_to(ROOT)}: 3 rows updated, Henry Rautio re-added, Kaluga Gurov deleted")


def move_placements() -> None:
    lines = _lines(PBP)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    seen: set[tuple[str, str, str, str, str]] = set()
    for line in lines[1:]:
        if not line or not any(e in line for e in ("992517335", "1001076315", "941418343", "973573676",
                                                   "996293200", "1081766954", "1076876907")):
            out.append(line)
            continue
        r = _row(header, line)
        key = (r["event_id"], r["division_canon"], r["place"], r["person_id"], r["norm"])
        if r["competitor_type"] != "player" or key not in MOVES:
            out.append(line)
            continue
        if key in seen:
            raise AssertionError(f"placements: two rows match {key}")
        seen.add(key)
        pid, canon = MOVES[key]
        r["person_id"], r["person_canon"], r["norm"] = pid, canon, canon.lower()
        r["person_unresolved"] = ""
        out.append(_emit([r[h] for h in header]))
    missing = set(MOVES) - seen
    if missing:
        raise AssertionError(f"placements not found (already patched?): {sorted(missing)}")
    PENDING[PBP] = "\n".join(out)
    print(f"{PBP.relative_to(ROOT)}: {len(seen)} place(s) moved")


def rule_aliases() -> None:
    lines = _lines(ALIASES)
    header = next(csv.reader([lines[0]]))
    out = [lines[0]]
    removed = set()
    resolves: dict[str, str] = {}
    for line in lines[1:]:
        if not line:
            continue
        r = _row(header, line)
        if (r["alias"], r["person_id"]) in REMOVED_ALIASES:
            removed.add((r["alias"], r["person_id"]))
            continue
        if r["person_id"] == GUROV_DOOMED:
            raise AssertionError(f"alias row names the deleted Gurov record: {line}")
        resolves.setdefault(normalize_name(r["alias"]), r["person_id"])
        out.append(line)
    if removed != REMOVED_ALIASES:
        raise AssertionError(f"alias rows not found (already patched?): {sorted(REMOVED_ALIASES - removed)}")
    for alias, pid, canon in ADDED_ALIASES:
        owner = resolves.get(normalize_name(alias))
        if owner is not None:
            raise AssertionError(f"alias {alias!r} already resolves to {owner}")
        out.append(_emit([alias, pid, canon, "verified", GUROV_NOTE]))
    out.append("")
    PENDING[ALIASES] = "\n".join(out)
    print(f"{ALIASES.relative_to(ROOT)}: {len(removed)} alias row(s) removed, {len(ADDED_ALIASES)} added")


def add_register_rows() -> None:
    lines = _lines(REGISTER)
    header = next(csv.reader([lines[0]]))
    body = [line for line in lines if line]
    existing = {frozenset((normalize_name(_row(header, line)["alias_name"]),
                           normalize_name(_row(header, line)["canon_name"]))) for line in body[1:]}
    next_number = max(int(_row(header, line)["pair_id"].split("-")[1]) for line in body[1:]) + 1
    for alias, canon, alias_pid, canon_pid, status, notes in RULINGS:
        key = frozenset((normalize_name(alias), normalize_name(canon)))
        if key in existing:
            raise AssertionError(f"register already rules {alias!r} and {canon!r} (already patched?)")
        row = {h: "" for h in header}
        row.update({"pair_id": f"R-{next_number}", "alias_name": alias, "canon_name": canon,
                    "alias_pid": alias_pid, "canon_pid": canon_pid, "evidence_needed": "none",
                    "status": status, "notes": notes})
        body.append(_emit([row[h] for h in header]))
        existing.add(key)
        next_number += 1
    PENDING[REGISTER] = "\n".join(body) + "\n"
    print(f"{REGISTER.relative_to(ROOT)}: {len(RULINGS)} ruled row(s) added")


def postconditions() -> None:
    for path in (PT, PBP, ALIASES):
        if GUROV_DOOMED in PENDING[path]:
            raise AssertionError(f"{path.name} would still name the deleted Gurov record")
    pbp = list(csv.DictReader(io.StringIO(PENDING[PBP])))
    henry = [r for r in pbp if r["person_id"] == HENRY]
    heikki = [r for r in pbp if r["person_id"] == HEIKKI]
    coventry = [r for r in pbp if r["person_id"] == COVENTRY]
    gurov = [r for r in pbp if r["person_id"] == GUROV]
    if (len(henry), len(heikki), len(coventry), len(gurov)) != (3, 2, 3, 3):
        raise AssertionError(f"place counts Henry/Heikki/Coventry/Gurov: "
                             f"{(len(henry), len(heikki), len(coventry), len(gurov))}, expected (3, 2, 3, 3)")
    if any(r["person_canon"] == "Damian Budzik" for r in coventry):
        raise AssertionError("a Coventry place still carries Budzik's name")


def main() -> None:
    for p in (PT, PBP, ALIASES, REGISTER):
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)
    rule_persons_truth()
    move_placements()
    rule_aliases()
    add_register_rows()
    postconditions()
    for path, text in PENDING.items():
        path.write_text(text, encoding="utf-8")
    print("Split Henry Rautio and Damien Coventry, merged Kaluga Gurov, recorded 4 rulings")


if __name__ == "__main__":
    main()
