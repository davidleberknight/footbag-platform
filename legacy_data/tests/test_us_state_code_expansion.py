"""USA club regions recorded as a two-letter code rather than a state name.

The legacy dump is not uniformly coded. Its USA rows carry a two-letter state
code while its Canadian rows already carry full province names, so the clubs
country page splits into roughly twice as many sections as there are states, half
of them reading as an abbreviation and half as a place name — two headings for
the same state.

The correction expands the code at source, in the dump-to-seed mapping, so no
display code folds anything at render. Dump-derived rows are rebuilt on every
run, so this touches no mirror row and the preserve-verbatim contract is not
involved.

The rule is deliberately not "two letters means a state code". Exactly one club
outside the USA carries a two-letter region, and a length rule would rewrite it
into a US state. That club is pinned here as the counterexample it is, alongside
Canada, whose provinces must stay untouched.
"""
from __future__ import annotations

import csv
import importlib.util
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
_SEED = _ROOT / "legacy_data" / "seed" / "clubs.csv"

_spec = importlib.util.spec_from_file_location(
    "overlay_under_test", _ROOT / "legacy_data" / "scripts" / "overlay_clubs_from_dump.py")
ov = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ov)

expand = ov.expand_us_state_code


# ── the expansion ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("code, name", [
    ("CA", "California"), ("NY", "New York"), ("TX", "Texas"),
    ("OR", "Oregon"), ("MA", "Massachusetts"), ("DC", "District of Columbia"),
    ("NC", "North Carolina"), ("RI", "Rhode Island"),
])
def test_a_us_state_code_becomes_its_full_name(code, name):
    assert expand(code, "USA") == name


def test_the_expansion_is_case_insensitive_on_the_code():
    assert expand("ca", "USA") == "California"
    assert expand("Ny", "USA") == "New York"


def test_a_name_already_spelled_out_is_untouched():
    for already in ("California", "New York", "District of Columbia", "Washington"):
        assert expand(already, "USA") == already


def test_a_blank_region_stays_blank():
    assert expand("", "USA") == ""


def test_the_expansion_is_idempotent():
    assert expand(expand("CA", "USA"), "USA") == "California"


# ── the counterexamples ──────────────────────────────────────────────────────

def test_the_chilean_two_letter_region_is_not_a_state_code():
    # The reason this is not a length rule. RM is Región Metropolitana; a rule
    # keyed on length alone would file a Chilean club under a US state.
    assert expand("RM", "Chile") == "RM"


@pytest.mark.parametrize("code, elsewhere, would_become", [
    ("WA", "Australia", "Washington"),
    ("MI", "Italy", "Michigan"),
    ("CO", "Colombia", "Colorado"),
    ("VA", "Spain", "Virginia"),
    # Real regions elsewhere that happen not to collide; they must stay put too,
    # and the table is what spares them rather than the country test.
    ("SA", "Australia", None),
    ("NT", "Australia", None),
])
def test_a_code_that_is_also_a_us_state_stays_put_outside_the_usa(code, elsewhere,
                                                                 would_become):
    # The reason the country scope is load-bearing rather than belt and braces.
    # The Chilean case above is spared by the table alone, because RM is not a US
    # state code — but Western Australia, South Australia and several others
    # collide outright with real ones. Without the country test an Australian club
    # in WA would be filed under Washington.
    assert expand(code, elsewhere) == code
    if would_become:
        assert expand(code, "USA") != code, (
            f"{code} is meant to collide with a US state; if it stops doing so "
            "this test no longer demonstrates why the country scope exists")


def test_canada_keeps_its_province_names():
    for province in ("Ontario", "British Columbia", "Alberta", "Nova Scotia"):
        assert expand(province, "Canada") == province


def test_a_two_letter_canadian_code_is_left_alone_too():
    # Canada is already on full names, so nothing should expand there — and if a
    # coded row ever appeared it would be a separate ruling, not this one.
    assert expand("ON", "Canada") == "ON"
    assert expand("BC", "Canada") == "BC"


def test_an_unknown_two_letter_code_in_the_usa_is_left_as_it_is():
    # Not guessed at. An abbreviation the table does not know stays put so it is
    # visible as something to rule on rather than silently becoming a state.
    assert expand("ZZ", "USA") == "ZZ"
    assert expand("XX", "USA") == "XX"


def test_a_longer_abbreviation_is_not_expanded():
    assert expand("Calif.", "USA") == "Calif."


# ── the table itself ─────────────────────────────────────────────────────────

def test_the_table_covers_every_state_and_the_district():
    # Fifty states plus DC, plus the five inhabited territories.
    assert len(ov._US_STATE_NAMES) == 56
    for essential in ("AK", "HI", "DE", "ND", "KY", "LA", "NM", "WV", "DC"):
        assert essential in ov._US_STATE_NAMES, essential


def test_no_state_name_is_itself_two_letters():
    # Otherwise expanding would be indistinguishable from not expanding, and the
    # idempotence above would be accidental.
    assert all(len(v) > 2 for v in ov._US_STATE_NAMES.values())


# ── against the delivered seed ───────────────────────────────────────────────

@pytest.mark.skipif(not _SEED.exists(), reason="the club seed is not present here")
def test_every_coded_usa_region_in_the_seed_is_one_the_table_knows():
    """The expansion must reach all of them, or the country page keeps a split
    heading for whichever state it missed."""
    rows = list(csv.DictReader(_SEED.open(encoding="utf-8")))
    coded = {r["region"].strip().upper() for r in rows
             if r["country"].strip().upper() in ov._US_COUNTRY_VALUES
             and len(r["region"].strip()) == 2}
    assert coded, "no coded USA region left in the seed; this test has nothing to check"
    unknown = coded - set(ov._US_STATE_NAMES)
    assert not unknown, f"the table does not know {sorted(unknown)}"


@pytest.mark.skipif(not _SEED.exists(), reason="the club seed is not present here")
def test_the_only_two_letter_region_outside_the_usa_is_the_chilean_one():
    """Pinned against the data rather than asserted from the card. If a second
    one ever appears, the country-scoped rule needs re-reading before it is
    assumed safe."""
    rows = list(csv.DictReader(_SEED.open(encoding="utf-8")))
    outside = [(r["country"].strip(), r["region"].strip()) for r in rows
               if r["country"].strip().upper() not in ov._US_COUNTRY_VALUES
               and len(r["region"].strip()) == 2]
    assert outside == [("Chile", "RM")], outside


@pytest.mark.skipif(not _SEED.exists(), reason="the club seed is not present here")
def test_expanding_the_seed_would_leave_no_split_headings():
    """The outcome the correction exists for, computed without writing anything:
    after expansion every USA region is a full name, so each state contributes
    one heading instead of two."""
    rows = list(csv.DictReader(_SEED.open(encoding="utf-8")))
    usa = [r for r in rows if r["country"].strip().upper() in ov._US_COUNTRY_VALUES]
    expanded = {expand(r["region"], r["country"]) for r in usa if r["region"].strip()}
    assert all(len(v) > 2 for v in expanded), sorted(v for v in expanded if len(v) <= 2)
