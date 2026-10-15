"""
test_extract_clubs_country.py
=============================

Pins the club extractor's country fold. The platform names each country by the
one canonical spelling its country picker offers, and the country page address,
the duplicate-club checks and the club-to-person matching all compare that
spelling exactly. The mirror writes two countries differently, so a club page
saying "USA" or "The Netherlands" must reach the club seed as "United States" or
"Netherlands", and every country already canonical must pass through unchanged.

Run from repo root:
    python -m pytest legacy_data/tests/test_extract_clubs_country.py -v
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
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


ex = _load("extract_clubs")

PAGE = """<html><body>
<h1 class="clubsShowName">Test Club</h1>
<div class="clubsLocationHeader">{location}</div>
<div id="ClubsWelcome">We play.</div>
<div id="MainModified">Created Sun Jan 15 10:16:52 2012; last update Sun Jan 15 10:16:52 2012.</div>
</body></html>"""


def extract(tmp_path, location: str):
    path = tmp_path / "club.html"
    path.write_text(PAGE.format(location=location), encoding="utf-8")
    return ex.extract_club(str(path), "1246472708")


@pytest.mark.parametrize(
    "location, country",
    [
        ("Portland, Oregon, USA", "United States"),
        ("Amsterdam, The Netherlands", "Netherlands"),
    ],
)
def test_mirror_spelling_is_folded_to_the_canonical_name(tmp_path, location, country):
    # Broken, a US club lands on its own country page apart from every member
    # and event in the United States, and slips past their duplicate checks.
    assert extract(tmp_path, location)["country"] == country


def test_a_canonical_country_passes_through_unchanged(tmp_path):
    # Broken, a fold that rewrote other names would move clubs off pages that
    # are already right.
    for country in ("Canada", "United Kingdom", "Czech Republic", "Netherlands"):
        assert extract(tmp_path, f"Somewhere, {country}")["country"] == country, country
