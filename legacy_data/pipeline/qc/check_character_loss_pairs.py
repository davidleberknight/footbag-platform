#!/usr/bin/env python3
"""
QC: character-loss duplicate persons in the frozen identity lock.

The legacy site stored many names in a Central European encoding. Crawled
pages carry the same person under several spellings: the correct one, a
mojibake form where an accented letter renders as a stray glyph, and a form
where the letter is simply gone. When a lost-letter spelling reaches the
canonicalizer as an unrecognised participant, it is minted as its own person
row carrying no player ids and no legacy account link. That row can never be
claimed by the real player, and it splits their competition record.

This check reports those rows. It looks for a person whose normalized name is
a character-deletion of another person's normalized name, in either direction,
within two characters, restricted to rows that carry neither player ids nor a
legacy account link. Restricting to those rows matters: an unclaimable orphan
is the shape that causes the harm, and comparing every name against every
other name reports far more noise than signal.

## Why this reports rather than blocks

A dropped diacritic is not mechanically distinguishable from a real
difference between two people. The surviving names in the lock are themselves
often already transliterated, so the missing character is an ordinary letter:
the gap between 'Przemysaw' and 'Przemyslaw' looks exactly like the gap
between 'Tim Kelly' and 'Tim Kelley', and only a person who knows the players
can tell those apart. Every pair therefore needs a human ruling, which is why
this runs as a warning and why ruled pairs are recorded rather than guessed.

## Suppressing a ruled pair

A pair stops being reported once it appears in overrides/identity_review_queue.csv,
matched on the two person ids or, when those are blank, on the two names. The
register is the record that a human has seen the pair, whatever they decided;
it is not a claim that the pair was merged.

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

# An orphan minted from an unrecognised participant carries this source prefix.
ORPHAN_SOURCE_PREFIX = "patch_v53:"

# One or two characters. More than that admits shortened given names, which are
# a different question.
MAX_LOST_CHARACTERS = 2


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


def is_unclaimable_orphan(row: dict) -> bool:
    return (
        (row.get("source") or "").startswith(ORPHAN_SOURCE_PREFIX)
        and not (row.get("player_ids_seen") or "").strip()
        and not (row.get("legacyid") or "").strip()
    )


def load_register(path: Path) -> set[frozenset]:
    """Pairs a human has already seen, keyed on ids when present, else names."""
    if not path.exists():
        return set()
    seen: set[frozenset] = set()
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            alias_pid = (row.get("alias_pid") or "").strip()
            canon_pid = (row.get("canon_pid") or "").strip()
            if alias_pid and canon_pid:
                seen.add(frozenset((alias_pid, canon_pid)))
            alias_name = normalize_name(row.get("alias_name") or "")
            canon_name = normalize_name(row.get("canon_name") or "")
            if alias_name and canon_name:
                seen.add(frozenset((alias_name, canon_name)))
    return seen


def find_pairs(rows: list[dict]) -> list[tuple[dict, dict, int]]:
    by_length: dict[int, list[tuple[dict, str]]] = defaultdict(list)
    for r in rows:
        n = normalize_name(r.get("person_canon") or "")
        if n:
            by_length[len(n)].append((r, n))

    found: list[tuple[dict, dict, int]] = []
    # Two orphans can be each other's counterpart; report that pair once.
    reported: set[frozenset] = set()
    for orphan in rows:
        if not is_unclaimable_orphan(orphan):
            continue
        o_norm = normalize_name(orphan.get("person_canon") or "")
        if not o_norm or is_initialled(o_norm):
            continue
        for delta in range(1, MAX_LOST_CHARACTERS + 1):
            for length in (len(o_norm) - delta, len(o_norm) + delta):
                for other, c_norm in by_length.get(length, []):
                    if other["effective_person_id"] == orphan["effective_person_id"]:
                        continue
                    if is_initialled(c_norm):
                        continue
                    shorter, longer = sorted((o_norm, c_norm), key=len)
                    if not is_subsequence(shorter, longer):
                        continue
                    key = frozenset(
                        (orphan["effective_person_id"], other["effective_person_id"])
                    )
                    if key in reported:
                        continue
                    reported.add(key)
                    found.append((orphan, other, delta))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--truth", type=Path, default=DEFAULT_TRUTH,
                        help="identity-lock person truth file")
    parser.add_argument("--register", type=Path, default=DEFAULT_REGISTER,
                        help="register of pairs a human has already ruled on")
    args = parser.parse_args()

    truth = args.truth.resolve()
    register = args.register.resolve()

    print("=== character-loss duplicate persons ===")
    print(f"truth file: {truth}")
    print(f"register:   {register}")
    print("Reports a person carrying no player ids and no legacy account link whose")
    print(f"name is a deletion of another person's name by up to {MAX_LOST_CHARACTERS} characters.")

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

    pairs = find_pairs(rows)

    unregistered = []
    for orphan, other, delta in pairs:
        by_id = frozenset((orphan["effective_person_id"], other["effective_person_id"]))
        by_name = frozenset((
            normalize_name(orphan["person_canon"]),
            normalize_name(other["person_canon"]),
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
    print("Rule each one, then record it in the review register so it stops being reported.")
    print("A pair that is one person is repaired by a truth-file patch plus an alias row;")
    print("a pair that is two people is recorded as such and left alone.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
