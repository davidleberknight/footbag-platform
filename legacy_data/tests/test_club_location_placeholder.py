"""
test_club_location_placeholder.py
=================================

Pins the legacy empty marker that the club form stored in a location field. The
word "none" on its own means the field was never filled in, and it is data-shaped:
it survives every decode and reads as a place name downstream, so it reached the
published club location line as "Itabashi-ku, Tokyo, none, Japan".

What is pinned:

  - a field that is exactly the marker, in any case or padding, becomes blank;
  - a real place keeps its value, including one that merely contains the word;
  - both seed producers apply the rule, so a marker cleared by one producer does
    not return when the other runs.

Run from repo root:
    python -m pytest legacy_data/tests/test_club_location_placeholder.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = REPO_ROOT / "legacy_data" / "scripts"


def _load(name: str):
    sys.path.insert(0, str(SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


blank_location_placeholder = _load("club_curation").blank_location_placeholder


# ─── the marker is dropped ───────────────────────────────────────────────────

@pytest.mark.parametrize("value", ["none", "None", "NONE", "  none  ", "nOnE"])
def test_marker_becomes_blank(value):
    assert blank_location_placeholder(value) == ""


def test_missing_value_is_blank():
    assert blank_location_placeholder(None) == ""
    assert blank_location_placeholder("") == ""


# ─── every real place survives ───────────────────────────────────────────────

@pytest.mark.parametrize(
    "value",
    [
        "Tokyo",
        "Oregon",
        "Nürnberg - Fürth",
        "Нижний Тагил",
        "Distrito Capital",
    ],
)
def test_real_place_is_untouched(value):
    assert blank_location_placeholder(value) == value


@pytest.mark.parametrize("value", ["Nones", "None Valley", "Saint-None-sur-Loire"])
def test_word_inside_a_longer_place_is_not_a_marker(value):
    assert blank_location_placeholder(value) == value


def test_marker_rule_runs_after_the_shared_text_clean():
    # A marker stored as numeric character references is still a marker, because
    # the shared clean decodes before the comparison.
    assert blank_location_placeholder("&#110;&#111;&#110;&#101;") == ""


# ─── both producers apply it ─────────────────────────────────────────────────

def test_mirror_extractor_clears_the_marker_from_a_club_page(tmp_path):
    mod = _load("extract_clubs")
    page = tmp_path / "club.html"
    page.write_text(
        '<h1 class="clubsShowName">tossLife</h1>'
        '<div class="clubsLocationHeader">Tokyo, none, Japan</div>',
        encoding="utf-8",
    )
    row = mod.extract_club(page, "1021482230")
    assert row["region"] == ""
    assert row["city"] == "Tokyo"
    assert row["country"] == "Japan"


def test_dump_overlay_clears_the_marker_from_a_dump_record():
    mod = _load("overlay_clubs_from_dump")
    row = mod.dump_row_to_seed_row(
        {"ClubID": "1021482230", "Name": "tossLife", "City": "Tokyo",
         "State": "none", "Country": "Japan", "URL": "", "Created": "0", "Modified": "0"}
    )
    assert row["region"] == ""
    assert row["city"] == "Tokyo"
    assert row["country"] == "Japan"
