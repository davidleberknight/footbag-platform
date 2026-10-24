"""A historical player's country comes from explicit evidence only.

The country shows on a player's public page and is carried into a member's
profile at claim, so it must state the person's own country. A curated decision
comes first, then the country on their legacy account, then a country their own
result lines repeat; otherwise it is unknown. Where their events were held is
never evidence of it.

Run from repo root:
    python -m pytest legacy_data/tests/test_player_country.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from collections import Counter
from pathlib import Path

_MOD = Path(__file__).resolve().parents[1] / "pipeline" / "historical" / "player_country.py"
_spec = importlib.util.spec_from_file_location("player_country", _MOD)
pc = importlib.util.module_from_spec(_spec)
sys.modules["player_country"] = pc
_spec.loader.exec_module(pc)

# The shape of a legacy member profile's location block, as the mirror serves it.
PROFILE = ("<dl><dt>Location:</dt><!--Mirror: member address line removed-->"
           "<dd>Town, ST</dd><dd>Deutschland</dd></dl>")


def test_spellings_and_codes_map_to_one_name():
    # Defect caught: one country appearing under several names, or a local name dropped.
    assert {pc.country_name(s) for s in ["USA", "united states", "U.S.A."]} == {"United States"}
    assert pc.country_name("Deutschland") == "Germany"
    assert pc.country_name("Česká republika") == "Czech Republic"
    assert pc.country_name("Uk") == "United Kingdom"


def test_a_code_that_is_also_a_us_state_is_not_evidence():
    # Defect caught: a Californian counted as Canadian, a Delawarean as German.
    assert pc.country_name("CA") == ""
    assert pc.country_name("DE") == ""
    assert pc.country_name("CZ") == "Czech Republic"


def test_the_profile_country_is_the_last_location_value():
    assert pc.profile_country(PROFILE) == ("Deutschland", "Germany")
    assert pc.profile_country("<p>no location block</p>") == ("", "")


def test_a_result_line_country_is_read_from_brackets_or_the_last_comma_part():
    assert pc.entry_countries("Alpha Player (CZ)") == {"Czech Republic"}
    assert pc.entry_countries("Alpha Player, Town, Finland") == {"Finland"}
    assert pc.entry_countries("Alpha Player (CA)") == set()  # a state, not a country
    assert pc.entry_countries("Alpha Player 145.5") == set()


def test_result_lines_must_repeat_a_country_to_state_it():
    # Defect caught: one stray token stated as a player's nationality, or a split
    # record settled by a guess.
    assert pc.repeated_result_country(Counter({"Finland": 1})) == ""
    assert pc.repeated_result_country(Counter({"Finland": 2})) == "Finland"
    assert pc.repeated_result_country(Counter({"Poland": 22, "Russia": 1})) == "Poland"
    assert pc.repeated_result_country(Counter({"Canada": 2, "United States": 1})) == ""
    assert pc.repeated_result_country(Counter({"Germany": 1, "France": 1})) == ""


def test_curated_then_account_then_results_and_nothing_else():
    # Defect caught: a weaker source overruling a stronger one.
    tokens = Counter({"Germany": 5})
    assert pc.choose_country("Denmark", "Switzerland", tokens) == "Denmark"
    assert pc.choose_country(pc.HOLD, "Switzerland", tokens) == ""
    assert pc.choose_country(None, "Switzerland", tokens) == "Switzerland"
    assert pc.choose_country(None, "", tokens) == "Germany"
    assert pc.choose_country(None, "", Counter()) == ""
