"""An event with no known day is stored as its year, and the load refuses otherwise.

Some historical events are known only by their year. The site renders a bare year
as the year alone, so storing one keeps the unknown day unknown; any day or month
on such an event was invented. The MVFP seed loader checks every loaded event
against its seed before it commits, and these exercise that check and the date
rule it enforces on synthetic rows.

Run from repo root:
    python -m pytest legacy_data/tests/test_event_dates_unknown_stay_unknown.py -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_SCRIPT = (Path(__file__).resolve().parents[1] / "event_results" / "scripts"
           / "08_load_mvfp_seed_full_to_sqlite.py")
_spec = importlib.util.spec_from_file_location("mvfp_seed_loader", _SCRIPT)
loader = importlib.util.module_from_spec(_spec)
sys.modules["mvfp_seed_loader"] = loader
_spec.loader.exec_module(loader)


def _seed(key, year, start="", end=""):
    return {"event_key": key, "year": year, "start_date": start, "end_date": end}


UNDATED = _seed("1985_worlds", "1985")
DATED = _seed("2012_jam", "2012", "2012-07-01", "2012-07-01")


def test_an_undated_event_is_given_its_year_alone():
    # Defect caught: an invented day presented on the event page as fact.
    assert loader.event_dates(UNDATED) == ("1985", "1985")


def test_a_dated_event_keeps_the_seed_dates():
    # A real 1 July event is not mistaken for an invented one.
    assert loader.event_dates(DATED) == ("2012-07-01", "2012-07-01")


def test_an_invented_day_on_an_undated_event_is_reported():
    # Defect caught: a fallback that fills in a day passing the load silently.
    loaded = {"1985_worlds": ("1985-07-01", "1985-07-01"), "2012_jam": ("2012-07-01", "2012-07-01")}
    assert loader.fabricated_event_dates([UNDATED, DATED], loaded) == ["1985_worlds"]


def test_stored_dates_matching_the_seed_pass():
    loaded = {"1985_worlds": ("1985", "1985"), "2012_jam": ("2012-07-01", "2012-07-01")}
    assert loader.fabricated_event_dates([UNDATED, DATED], loaded) == []


def test_a_seed_event_missing_from_the_table_is_reported():
    # Defect caught: an event dropped on load counted as correctly dated.
    assert loader.fabricated_event_dates([UNDATED], {}) == ["1985_worlds"]
