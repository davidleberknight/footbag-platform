#!/usr/bin/env python3
"""
QC: character-loss duplicate persons in the frozen identity lock.

The legacy site stored many names in a Central European encoding. Crawled
pages carry the same person under several spellings: the correct one, a
mojibake form where an accented letter renders as a stray glyph, and a form
where the letter is simply gone. When a lost-letter spelling reaches the
canonicalizer as an unrecognised participant, it is minted as its own person
row carrying no legacy account link, and sometimes player ids of its own. That
row can never be claimed by the real player, and it splits their competition
record.

This check reports those rows. It looks for two people whose folded names are
identical, or where one is a character-deletion of the other, in either
direction, within two characters. Folding starts from the shared name
normalization and also maps the letters it leaves alone, such as the Polish
stroke l, so 'Rafał' and 'Rafal' compare as one name. Neither player ids nor an
account link exempt a row: a split twin minted with ids of its own is the same
harm, and two records each able to hold an account are the shape that splits a
player's results from their claim.

The identity lock is read at the QC gate, before the persons master exists. A
second run after the persons master is built passes --persons-master, which adds
the provisional people who hold an account but have no results. A provisional
row already matched to a historical person is that person, so it is skipped.

## Why this blocks, and what a ruling may say

A dropped diacritic is not mechanically distinguishable from a real
difference between two people. The surviving names in the lock are themselves
often already transliterated, so the missing character is an ordinary letter:
the gap between 'Przemysaw' and 'Przemyslaw' looks exactly like the gap
between 'Tim Kelly' and 'Tim Kelley', and only a person who knows the players
can tell those apart. Every pair therefore needs a human ruling before a
production ship, and the check blocks until each has one. A ruling may be that
the two are one person, two people, or that the evidence cannot tell; the last
is an honest answer and settles the pair without merging anything, so the gate
never forces an identity call the evidence does not support.

## Settling a ruled pair

A pair stops being reported once it appears in overrides/identity_review_queue.csv
with a ruled status, matched on the two person ids or, when those are blank, on
the two names. The ruled statuses are SAME (one person, repaired by a
truth-file patch plus an alias row), DIFFERENT (two people, left alone),
CANNOT_TELL (not determinable from the evidence, left alone) and the older
RESOLVED. A row still under review (REVIEW, DO_NOT_MERGE_YET) does not settle
its pair: an unruled pair is exactly what this check exists to stop.

## Exit codes

    0  PASS — every detected pair is registered
    0  SKIP — the identity lock is absent (nothing to compare)
    1  FAIL — unregistered character-loss pairs found
    2  ERROR — an input exists but could not be read
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_ROOT = SCRIPT_DIR.parents[1]

sys.path.insert(0, str(LEGACY_ROOT))
from pipeline.identity.alias_resolver import normalize_name  # noqa: E402

DEFAULT_TRUTH = LEGACY_ROOT / "inputs" / "identity_lock" / "Persons_Truth_Final.csv"
DEFAULT_REGISTER = LEGACY_ROOT / "overrides" / "identity_review_queue.csv"

# Register statuses that record a ruling and so settle a pair.
RULED_STATUSES = frozenset({"SAME", "DIFFERENT", "CANNOT_TELL", "RESOLVED"})

# One or two characters. More than that admits shortened given names, which are
# a different question.
MAX_LOST_CHARACTERS = 2

# Letters with no combining-mark decomposition, which the shared normalization
# leaves as they are. This only decides what gets compared for a human to rule on;
# no identity is resolved from it.
UNDECOMPOSED_LETTERS = str.maketrans({
    "ł": "l", "đ": "d", "ø": "o", "ß": "ss", "æ": "ae", "œ": "oe", "ı": "i", "ħ": "h",
})


def fold_name(name: str) -> str:
    return normalize_name(name or "").translate(UNDECOMPOSED_LETTERS)


def is_initialled(normalized: str) -> bool:
    """A name reduced to an initial, such as 'D Kramer' beside 'Dan Kramer'.

    Someone recorded under an initial is not damage and is not resolvable from
    the spelling alone, so it belongs to the wider identity-review question
    rather than to this check.
    """
    return any(len(token.rstrip(".")) <= 1 for token in normalized.split())


def is_subsequence(shorter: str, longer: str) -> bool:
    it = iter(longer)
    return all(c in it for c in shorter)


def load_rows(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_provisional_people(path: Path, known_ids: set[str]) -> list[dict]:
    """Persons-master rows the lock does not hold, in the lock's column names."""
    people = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            person_id = (row.get("person_id") or row.get("master_person_id") or "").strip()
            if not person_id or person_id in known_ids:
                continue
            if (row.get("matched_historical_person_id") or "").strip():
                continue
            people.append({
                "effective_person_id": person_id,
                "person_canon": row.get("person_name") or "",
                "legacyid": (row.get("legacy_member_id") or "").strip(),
            })
    return people


def load_register(path: Path) -> set[frozenset]:
    """Pairs a human has ruled on, keyed on ids when present, else names."""
    if not path.exists():
        return set()
    seen: set[frozenset] = set()
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if (row.get("status") or "").strip() not in RULED_STATUSES:
                continue
            alias_pid = (row.get("alias_pid") or "").strip()
            canon_pid = (row.get("canon_pid") or "").strip()
            if alias_pid and canon_pid:
                seen.add(frozenset((alias_pid, canon_pid)))
            alias_name = fold_name(row.get("alias_name"))
            canon_name = fold_name(row.get("canon_name"))
            if alias_name and canon_name:
                seen.add(frozenset((alias_name, canon_name)))
    return seen


def find_pairs(rows: list[dict]) -> list[tuple[dict, dict, int]]:
    by_length: dict[int, list[tuple[dict, str]]] = defaultdict(list)
    for r in rows:
        n = fold_name(r.get("person_canon"))
        if n:
            by_length[len(n)].append((r, n))

    found: list[tuple[dict, dict, int]] = []
    # Each side of a pair meets the other in this loop; report that pair once.
    reported: set[frozenset] = set()
    for person in rows:
        p_norm = fold_name(person.get("person_canon"))
        if not p_norm or is_initialled(p_norm):
            continue
        for delta in range(0, MAX_LOST_CHARACTERS + 1):
            for length in {len(p_norm) - delta, len(p_norm) + delta}:
                for other, c_norm in by_length.get(length, []):
                    if other["effective_person_id"] == person["effective_person_id"]:
                        continue
                    if is_initialled(c_norm):
                        continue
                    shorter, longer = sorted((p_norm, c_norm), key=len)
                    if not is_subsequence(shorter, longer):
                        continue
                    key = frozenset(
                        (person["effective_person_id"], other["effective_person_id"])
                    )
                    if key in reported:
                        continue
                    reported.add(key)
                    found.append((person, other, delta))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--truth", type=Path, default=DEFAULT_TRUTH,
                        help="identity-lock person truth file")
    parser.add_argument("--register", type=Path, default=DEFAULT_REGISTER,
                        help="register of pairs a human has already ruled on")
    parser.add_argument("--persons-master", type=Path, default=None,
                        help="also compare the provisional people in this persons master")
    args = parser.parse_args()

    truth = args.truth.resolve()
    register = args.register.resolve()

    print("=== character-loss duplicate persons ===")
    print(f"truth file: {truth}")
    print(f"register:   {register}")
    print("Reports two people whose folded names match, or differ by a deletion of up")
    print(f"to {MAX_LOST_CHARACTERS} characters, with or without an account link.")

    if not truth.exists():
        print(f"\nSKIP: identity lock not found (expected at {truth}).")
        return 0

    try:
        rows = load_rows(truth)
    except Exception as e:
        print(f"\nERROR: failed to read {truth}: {e}", file=sys.stderr)
        return 2

    try:
        ruled = load_register(register)
    except Exception as e:
        print(f"\nERROR: failed to read {register}: {e}", file=sys.stderr)
        return 2

    if args.persons_master is not None:
        master = args.persons_master.resolve()
        print(f"persons master: {master}")
        if not master.exists():
            print(f"\nERROR: {master} not found. persons/scripts/05_build_persons_master.py "
                  "writes it; run ./run_pipeline.sh full.", file=sys.stderr)
            return 2
        try:
            known = {r["effective_person_id"] for r in rows}
            rows = rows + load_provisional_people(master, known)
        except Exception as e:
            print(f"\nERROR: failed to read {master}: {e}", file=sys.stderr)
            return 2

    pairs = find_pairs(rows)

    unregistered = []
    for orphan, other, delta in pairs:
        by_id = frozenset((orphan["effective_person_id"], other["effective_person_id"]))
        by_name = frozenset((
            fold_name(orphan["person_canon"]),
            fold_name(other["person_canon"]),
        ))
        if by_id in ruled or by_name in ruled:
            continue
        unregistered.append((orphan, other, delta))

    print()
    print(f"rows scanned:        {len(rows)}")
    print(f"pairs detected:      {len(pairs)}")
    print(f"already registered:  {len(pairs) - len(unregistered)}")
    print(f"awaiting a ruling:   {len(unregistered)}")

    if not unregistered:
        print("STATUS: PASS")
        return 0

    print()
    for orphan, other, delta in sorted(unregistered, key=lambda p: p[0]["person_canon"]):
        print(
            f"  {orphan['person_canon']!r} ({orphan['effective_person_id'][:8]})"
            f"  <->  {other['person_canon']!r} ({other['effective_person_id'][:8]})"
            f"  lost={delta}"
        )
    print()
    print(f"STATUS: FAIL — {len(unregistered)} pair(s) awaiting a ruling")
    print("Rule each one and record the ruling in overrides/identity_review_queue.csv")
    print("with status SAME, DIFFERENT or CANNOT_TELL. A pair that is one person is also")
    print("repaired by a truth-file patch plus an alias row; the others are left alone.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
