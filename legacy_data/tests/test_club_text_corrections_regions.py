"""
test_club_text_corrections_regions.py
=====================================

Pins the two Florida region corrections in `overrides/club_text_corrections.csv`
as a durable repair rather than a hand edit of the generated club seed.

Why this exists. Bay Area Kickers and Clearwater Kickers are both dormant, so
the legacy dump carries no row for either and the mirror is the only source of
their region. The mirror files both under the two-letter postal abbreviation,
so a re-extract restores `Fl` over the full state name the committed seed
carries. The correction survives a rebuild only if it lives in the overrides
both seed producers apply; written into the seed it is reverted the first time
anyone regenerates, which is what happened once already.

Run from repo root:
    python -m pytest legacy_data/tests/test_club_text_corrections_regions.py -v
"""
from __future__ import annotations

import csv
import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
LEGACY = REPO_ROOT / "legacy_data"
CURATION = LEGACY / "scripts" / "club_curation.py"
SEED_CSV = LEGACY / "seed" / "clubs.csv"

# (legacy_club_key, club name as the seed records it)
DORMANT_FLORIDA_CLUBS = [
    ("1190299395", "Bay Area Kickers"),
    ("1339680237", "Clearwater Kickers"),
]
MIRROR_ABBREVIATION = "Fl"
CANONICAL_REGION = "Florida"


def _load():
    spec = importlib.util.spec_from_file_location("club_curation", CURATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


curation = _load()
CORRECTIONS = curation.load_club_text_corrections()


@pytest.mark.parametrize("club_key,name", DORMANT_FLORIDA_CLUBS)
def test_a_region_correction_exists_for_each_dormant_florida_club(club_key, name):
    assert CORRECTIONS.get((club_key, "region")) == CANONICAL_REGION, (
        f"{name} ({club_key}) has no durable region correction, so a re-extract "
        f"from the mirror will put back {MIRROR_ABBREVIATION!r}."
    )


@pytest.mark.parametrize("club_key,name", DORMANT_FLORIDA_CLUBS)
def test_the_correction_rewrites_the_mirror_value(club_key, name):
    """The shared apply step is what both seed producers call."""
    row = {field: "" for field in curation.SEED_FIELDNAMES}
    row["legacy_club_key"] = club_key
    row["region"] = MIRROR_ABBREVIATION
    corrected = curation.apply_club_text_corrections(row, club_key, CORRECTIONS)
    assert corrected["region"] == CANONICAL_REGION


@pytest.mark.parametrize("club_key,name", DORMANT_FLORIDA_CLUBS)
def test_the_committed_seed_already_carries_the_corrected_value(club_key, name):
    """
    The correction reproduces what the seed says rather than changing it. If
    these ever disagree, the seed has drifted from its own overrides and the
    next rebuild will move it.
    """
    with SEED_CSV.open(newline="", encoding="utf-8") as fh:
        rows = {r["legacy_club_key"]: r for r in csv.DictReader(fh)}
    assert rows[club_key]["region"] == CANONICAL_REGION


def test_every_correction_names_a_real_seed_column():
    """
    The loader aborts on a field outside the seed columns. Assert the file it
    actually ships is clean, so the abort is a guard rather than a live failure.
    """
    for (club_key, field) in CORRECTIONS:
        assert field in curation.SEED_FIELDNAMES
        assert club_key
