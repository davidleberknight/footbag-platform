#!/usr/bin/env python3
"""
patch_pt_v72_bind_csallo_member_account.py

Move IFPA member account 14652 onto the person who actually holds it, and put
that person's canonical name into the order their own member profile uses.

The account currently hangs off `Georgo Csallo` (e19b83c1). That row is not a
person. Its only supporting evidence is one placement, and in the current parse
that placement is a doubles team, `Georgo Csallo / Pecan`, whose team key is
this very id. A person row was minted out of a team key, given the team's first
name and the host event's country, and the partner was dropped. The Czech
Republic value on it is the same artifact seen elsewhere in this file: a person
row with no member account takes the country of its event, and the event was
Czech while the human is Hungarian.

The archived footbag.org member profile settles who 14652 belongs to:

    ID: 14652 · Gergo Csallo · handle rebelkid · Veszprem, Hungary
    Joined 03/25/02 · Tier 1 LIFETIME MEMBERSHIP

Veszprem is decisive. The player token behind the team row reads
`Georgo Csallo (Vesprem)`, the same city, so the corrupted given name on that
token and the profile describe one human. The delivered member export agrees
independently, giving `Gergo Csallo`, Hungary, user id rebelkid for account
14652. The only other profile in the mirror matching "georgo" is Petr Malina,
handle `georgoz`, Prague, never joined — a different human whose handle merely
contains the string.

Operations on the SURVIVOR row (58e6ac47), the Hungarian person the current
pipeline resolves that placement to:
  legacyid           '' -> '14652'
  person_canon       'Csallo Gergo' -> 'Gergo Csallo'
  person_canon_clean and last_token follow, being derived from person_canon

Operation on the SPURIOUS row (e19b83c1):
  legacyid           '14652' -> ''

The spurious row is cleared, not deleted. The current pipeline never mints it
as a person, so it costs nothing where it sits, and deleting a row is a wider
change than moving the one field that was wrong.

No alias is added here. The registry in overrides/person_aliases.csv already
resolves 'Gergo Csallo', 'Csallo Gergo' and 'Georgo Csallo' to the survivor,
which is the sanctioned home for name equivalence; this file carries identity,
not spellings. player_names_seen is left alone for the same reason: it records
what the sources actually said, and they did say 'Csallo Gergo'.

Expected diff:
  - row count unchanged
  - exactly 2 rows mutated, 3 fields on one and 1 field on the other
  - the set of player ids across the whole file is unchanged
  - exactly one row carries legacyid 14652 before and after; it changes hands

Reads the version-free file, which is always a copy of the newest snapshot,
and overwrites it in place. That file is tracked, so checking out that one path
is the rollback, and a second run stops on its own pre-conditions rather than
compounding the edit.

Usage (from legacy_data/):
    .venv/bin/python tools/patch_pt_v72_bind_csallo_member_account.py
"""

from __future__ import annotations

import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PT_IN = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"
PT_OUT = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final_v72.csv"
PT_VERSION_FREE = ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"

SURVIVOR_PID = "58e6ac47-fc96-5e9d-9121-99ef6927e939"
SPURIOUS_PID = "e19b83c1-2185-53eb-bc64-2d8800618f3e"

SURVIVOR_CANON_BEFORE = "Csallo Gergo"
SURVIVOR_CANON_AFTER = "Gergo Csallo"
SPURIOUS_CANON = "Georgo Csallo"

MEMBER_ID = "14652"


def parse_pipe(field_value: str) -> list[str]:
    return [p.strip() for p in (field_value or "").split("|") if p.strip()]


def norm_legacyid(raw: str) -> str:
    """Match the exporter's reading of this column, which tolerates the
    float-formatted values the original export produced ('14652.0')."""
    lid = (raw or "").strip()
    if not lid:
        return ""
    try:
        return str(int(float(lid)))
    except ValueError:
        return lid


def derive_clean_and_token(canon: str) -> tuple[str, str]:
    """person_canon_clean and last_token are restatements of person_canon, so
    renaming the person without them would leave the row disagreeing with
    itself. Nothing reads them for behaviour, which is exactly why a stale
    value here would go unnoticed."""
    return canon, canon.split()[-1].lower()


def main() -> None:
    if not PT_IN.exists():
        print(f"ERROR: {PT_IN} not found", file=sys.stderr)
        sys.exit(1)

    with open(PT_IN, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        assert fieldnames is not None
        rows = list(reader)

    rows_before = len(rows)
    print(f"input rows: {rows_before}")

    for required in ("effective_person_id", "person_canon", "legacyid",
                     "person_canon_clean", "last_token"):
        if required not in fieldnames:
            print(f"ERROR: column {required!r} missing from {PT_IN.name}", file=sys.stderr)
            sys.exit(2)

    survivor = next((r for r in rows if r["effective_person_id"] == SURVIVOR_PID), None)
    spurious = next((r for r in rows if r["effective_person_id"] == SPURIOUS_PID), None)
    if survivor is None:
        print(f"ERROR: survivor {SURVIVOR_PID} not found", file=sys.stderr)
        sys.exit(2)
    if spurious is None:
        print(f"ERROR: spurious row {SPURIOUS_PID} not found", file=sys.stderr)
        sys.exit(2)

    # ─── Pre-conditions ──────────────────────────────────────────────────
    if survivor["person_canon"] != SURVIVOR_CANON_BEFORE:
        raise AssertionError(
            f"survivor canon is {survivor['person_canon']!r}, expected "
            f"{SURVIVOR_CANON_BEFORE!r} — already patched, or the wrong row")
    if spurious["person_canon"] != SPURIOUS_CANON:
        raise AssertionError(f"spurious canon is {spurious['person_canon']!r}")
    if norm_legacyid(survivor["legacyid"]):
        raise AssertionError(
            f"survivor already carries account {norm_legacyid(survivor['legacyid'])!r}; "
            "this patch only fills a blank")
    if norm_legacyid(spurious["legacyid"]) != MEMBER_ID:
        raise AssertionError(
            f"spurious row carries {norm_legacyid(spurious['legacyid'])!r}, not {MEMBER_ID!r}")

    # The account must be held once and only once, or moving it would either
    # duplicate a member binding or silently drop somebody else's.
    holders = [r["effective_person_id"] for r in rows
               if norm_legacyid(r["legacyid"]) == MEMBER_ID]
    if holders != [SPURIOUS_PID]:
        raise AssertionError(f"account {MEMBER_ID} is held by {holders}, expected one holder")

    print("All pre-condition checks passed.")

    # ─── Conservation snapshot ───────────────────────────────────────────
    def all_pid_set(rows_iter: list[dict]) -> set[str]:
        s: set[str] = set()
        for r in rows_iter:
            s.update(parse_pipe(r["player_ids_seen"]))
        return s

    all_before = all_pid_set(rows)
    legacyids_before = sorted(
        norm_legacyid(r["legacyid"]) for r in rows if norm_legacyid(r["legacyid"]))
    untouched_before = sorted(
        tuple((k, r[k]) for k in fieldnames)
        for r in rows
        if r["effective_person_id"] not in (SURVIVOR_PID, SPURIOUS_PID)
    )

    # ─── Mutate ──────────────────────────────────────────────────────────
    clean, token = derive_clean_and_token(SURVIVOR_CANON_AFTER)
    survivor["legacyid"] = MEMBER_ID
    survivor["person_canon"] = SURVIVOR_CANON_AFTER
    survivor["person_canon_clean"] = clean
    survivor["last_token"] = token
    spurious["legacyid"] = ""

    # ─── Post-conditions ─────────────────────────────────────────────────
    if len(rows) != rows_before:
        raise AssertionError("row count changed")
    if norm_legacyid(survivor["legacyid"]) != MEMBER_ID:
        raise AssertionError("survivor did not take the account")
    if norm_legacyid(spurious["legacyid"]):
        raise AssertionError("spurious row still carries an account")
    if survivor["person_canon"] != SURVIVOR_CANON_AFTER:
        raise AssertionError("survivor was not renamed")

    holders_after = [r["effective_person_id"] for r in rows
                     if norm_legacyid(r["legacyid"]) == MEMBER_ID]
    if holders_after != [SURVIVOR_PID]:
        raise AssertionError(f"account {MEMBER_ID} now held by {holders_after}")

    if sorted(norm_legacyid(r["legacyid"]) for r in rows
              if norm_legacyid(r["legacyid"])) != legacyids_before:
        raise AssertionError("the multiset of member accounts changed")

    if all_pid_set(rows) != all_before:
        raise AssertionError("player id set drifted; this patch touches no player ids")

    untouched_after = sorted(
        tuple((k, r[k]) for k in fieldnames)
        for r in rows
        if r["effective_person_id"] not in (SURVIVOR_PID, SPURIOUS_PID)
    )
    if untouched_after != untouched_before:
        raise AssertionError("a non-target PT row was modified")

    with open(PT_OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    shutil.copyfile(PT_OUT, PT_VERSION_FREE)

    print()
    print(f"account {MEMBER_ID}: {SPURIOUS_PID[:8]}... -> {SURVIVOR_PID[:8]}...")
    print(f"survivor canon: {SURVIVOR_CANON_BEFORE!r} -> {survivor['person_canon']!r}")
    print(f"survivor derived: person_canon_clean={survivor['person_canon_clean']!r} "
          f"last_token={survivor['last_token']!r}")
    print(f"spurious {SPURIOUS_PID[:8]}... legacyid cleared; row retained")
    print(f"rows: {rows_before} -> {len(rows)} (unchanged); wrote {PT_OUT.name} + version-free")


if __name__ == "__main__":
    main()
