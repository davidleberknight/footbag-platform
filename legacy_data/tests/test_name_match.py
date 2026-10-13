"""
test_name_match.py
==================

The pipeline's copy of the claim step's name rule decides whether two names are
one person's the way the claim step does. The fold itself is held to the
application's functions by a parity suite on the application side; this file
covers what that suite cannot reach: the agreement rule, the nickname pairs read
from the curated file, and the placeholder birth date.

Run from repo root:
    python -m pytest legacy_data/tests/test_name_match.py -v
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "legacy_data"))

from pipeline.identity import name_match as nm  # noqa: E402

PAIRS = {"chris": frozenset({"christopher"}), "christopher": frozenset({"chris"}),
         "dick": frozenset({"richard"}), "rick": frozenset({"richard"}),
         "richard": frozenset({"dick", "rick"})}


def test_a_middle_name_never_blocks_a_match_and_a_maiden_name_makes_one():
    # A miss here leaves a married woman's record unlinked from her own account.
    assert nm.names_agree("Brenda Solonoski", "Brenda Marie Solonoski", PAIRS)
    assert nm.names_agree("Lisa McDaniel", "Lisa McDaniel Jones", PAIRS)


def test_first_names_must_agree_exactly_or_as_a_curated_pair():
    # A miss on the pair leaves a record unlinked; a match on two different first
    # names links one sibling's record to the other's account.
    assert nm.names_agree("Chris Routh", "Christopher Routh", PAIRS)
    assert not nm.names_agree("Chris Routh", "Carl Routh", PAIRS)
    # A pair applies directly, never through a shared long form.
    assert not nm.names_agree("Dick Hill", "Rick Hill", PAIRS)


def test_a_surname_particle_alone_never_makes_a_match():
    # "de" is shared by unrelated families; matching on it fuses two people.
    assert not nm.names_agree("Maria de Souza", "Maria de Silva", PAIRS)
    assert nm.names_agree("Maria de Souza", "Maria Souza", PAIRS)


def test_a_name_without_a_surname_matches_nothing():
    assert not nm.names_agree("Chris", "Chris Routh", PAIRS)
    assert not nm.names_agree("", "", PAIRS)


def test_the_curated_pairs_read_both_ways_and_fold_like_names(tmp_path):
    curated = tmp_path / "given_name_variants.csv"
    curated.write_text("short_form,long_form\nJindra,Jindřich\nTom,Thomas\n", encoding="utf-8")
    pairs = nm.load_nicknames(curated)
    # The accent is folded on the way in, so the pair meets an unaccented spelling.
    assert nm.first_names_agree("jindrich", "jindra", pairs)
    assert nm.first_names_agree("jindra", "jindrich", pairs)
    assert nm.names_agree("Jindra Smola", "Jindrich Smola", pairs)
    assert not nm.first_names_agree("tom", "jindra", pairs)


def test_the_committed_pairs_carry_the_curated_jindra_pair():
    # The curated file is what Jindrich Smola's three accounts and his record are
    # reached through; without the row his record stays unlinked.
    assert nm.first_names_agree("jindra", "jindrich", nm.load_nicknames())


def test_placeholder_birth_dates_corroborate_nothing():
    today = date(2026, 10, 13)
    for placeholder in ("", "1990", "1929-12-31", "1975-01-01", "2021-10-13", "2026-01-02"):
        assert nm.is_placeholder_birth_date(placeholder, today), placeholder
    for real in ("1930-01-02", "1975-06-15", "2021-10-12"):
        assert not nm.is_placeholder_birth_date(real, today), real


def test_the_five_year_window_survives_a_leap_day():
    assert nm.is_placeholder_birth_date("2021-03-01", date(2026, 2, 28)) is True
    assert nm.is_placeholder_birth_date("2019-03-01", date(2024, 2, 29)) is True
    assert nm.is_placeholder_birth_date("2019-02-28", date(2024, 2, 29)) is False
