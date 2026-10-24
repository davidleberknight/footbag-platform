"""
test_event_location_country.py
==============================

Pins the country fold in the historical export's event location parser. The
platform names each country by the one canonical spelling its country picker
offers, and events, members and clubs must agree on it. The mirror writes the
United States as "USA", so an event whose location carries no curated row must
still reach the events CSV as "United States", while every other country and the
existing sub-national corrections are left as they were.

The export script runs the whole export at import, so only the parser and the
two tables it reads are taken from its source and executed here.

Run from repo root:
    python -m pytest legacy_data/tests/test_event_location_country.py -v
"""
from __future__ import annotations

import ast
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "legacy_data" / "pipeline" / "historical" / "export_historical_csvs.py"
WANTED = {"_REGION_NOT_COUNTRY", "_CANONICAL_COUNTRY", "_US_STATE_REGIONS", "parse_location"}


def _load_parser():
    tree = ast.parse(SCRIPT.read_text(encoding="utf-8"))
    nodes = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in WANTED:
            nodes.append(node)
        elif isinstance(node, ast.AnnAssign) and getattr(node.target, "id", None) in WANTED:
            nodes.append(node)
    assert len(nodes) == len(WANTED), "the parser or one of its tables was not found"
    namespace: dict = {}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SCRIPT), "exec"), namespace)
    return namespace["parse_location"]


parse_location = _load_parser()


@pytest.mark.parametrize(
    "location, expected",
    [
        ("Willamette Park, West Linn Portland, USA", ("Willamette Park", "West Linn Portland", "United States")),
        ("Brooklyn, usa", ("Brooklyn", "", "United States")),
    ],
)
def test_usa_is_folded_to_the_canonical_name(location, expected):
    # Broken, those event pages say "USA" while every other US event, member
    # and club says "United States".
    assert parse_location(location) == expected


def test_other_countries_and_region_corrections_are_unchanged():
    # Broken, a fold that rewrote other names would move events off countries
    # that are already right, or undo the sub-national corrections.
    assert parse_location("Prague, Czech Republic") == ("Prague", "", "Czech Republic")
    assert parse_location("Glasgow, Scotland") == ("Glasgow", "Scotland", "United Kingdom")
    assert parse_location("Golden, Colorado, United States") == ("Golden", "Colorado", "United States")


def test_a_state_named_as_the_city_is_the_region_and_the_city_is_unknown():
    # Broken, an event page says it was held in the city of "Texas".
    assert parse_location("Texas, USA") == ("", "Texas", "United States")
    assert parse_location("Rhode Island, United States") == ("", "Rhode Island", "United States")


def test_a_name_that_is_both_city_and_state_stays_a_city():
    # Broken, New York City events would lose their city.
    assert parse_location("New York, USA") == ("New York", "", "United States")
    assert parse_location("Washington, USA") == ("Washington", "", "United States")
