"""The one test of whether a roster or account name is damaged in encoding.

The enrichment loader uses it to keep a damaged roster spelling off a person, and
the member load uses it to refuse an account name that is no better. Both must
judge a name the same way, so each reason is shown firing on a damaged name, and
clean names, accented ones included, are shown passing.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.identity.name_damage import roster_name_damage  # noqa: E402


@pytest.mark.parametrize("name, reason", [
    ("Rafa³ Player", "codepage-mismatch character"),
    ("Alpha Pla?er", "question mark for a lost letter"),
    ("S tìpán Player", "letter split from its accent"),
    # Defect caught: an account name still carrying the dump's accent markup
    # copied onto a person as if it were repaired.
    ("Daniel S<caron>ebek", "accent markup left in the name"),
])
def test_each_kind_of_damage_is_named(name, reason):
    assert roster_name_damage(name) == reason


@pytest.mark.parametrize("name", ["Štěpán Novák", "Rafał Piórkowski", "O'Brien", "Anne-Marie Smith"])
def test_a_clean_name_is_not_damaged(name):
    # Defect caught: a correctly accented name refused, which would stop the load
    # on every repaired account.
    assert roster_name_damage(name) == ""
